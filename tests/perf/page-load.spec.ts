// NFR-PERF-1 (§5.1 as amended by D4): the dashboard and product pages load in under 1 second on
// a mid-range phone over 4G after first visit, and in under 2 seconds even on a weak 4G signal,
// with a boutique-sized catalog.
//
// Runs in the "perf" Playwright project (Pixel 7) against the production build. The phone's CPU
// is slowed 4x (Lighthouse's mid-range phone) and the network is throttled with Chrome DevTools'
// presets: "Fast 4G" (165 ms request latency, ~8.1 Mbps down) for the 1 s target and "Slow 4G"
// (562.5 ms, ~1.4 Mbps down) for the 2 s backstop. Each page is opened once to warm the browser
// cache, then timed three times; the median of the three must be within budget.
import { expect, test, type Locator, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { removeDemo, seedDemo } from "../../prisma/seed-demo";
import { logInAs } from "../e2e/fixtures/users";

const RUNS = 3;
const CPU_SLOWDOWN = 4;

const NETWORKS = [
  {
    name: "4G",
    budgetMs: 1_000,
    latency: 150 * 1.1,
    downloadThroughput: (9 * 1024 * 0.9 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 0.9 * 1024) / 8,
  },
  {
    name: "weak 4G",
    budgetMs: 2_000,
    latency: 150 * 3.75,
    downloadThroughput: (1.6 * 1024 * 0.9 * 1024) / 8,
    uploadThroughput: (750 * 0.9 * 1024) / 8,
  },
] as const;
type Network = (typeof NETWORKS)[number];

// DevTools throttling only reaches requests the page makes itself, not ones a service worker
// makes on its behalf, so the service worker is kept out of the measurement.
test.use({ serviceWorkers: "block" });

let topProduct = { id: "", name: "" };

async function withTestDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  dotenv.config({ quiet: true });
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test.beforeAll(async () => {
  topProduct = await withTestDb(async (client) => {
    const { topProductId } = await seedDemo(client, { products: 5_000, days: 90 });
    const { rows } = await client.query<{ name: string }>(
      `select name from "Product" where id = $1`,
      [topProductId],
    );
    return { id: topProductId, name: rows[0].name };
  });
});

// Other test files share this database; their product lists must not fill up with demo data.
test.afterAll(async () => {
  await withTestDb(removeDemo);
});

async function throttle(page: Page, network: Network) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: network.latency,
    downloadThroughput: network.downloadThroughput,
    uploadThroughput: network.uploadThroughput,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
}

/**
 * Page-load time as the browser measures it: from starting the navigation to the end of the load
 * event (Navigation Timing). Timed in the page, not from the test, so Playwright's own round
 * trips, slowed by the CPU throttle, don't count against the app. The heading check makes sure
 * the page that loaded is the right one.
 */
async function timeLoad(page: Page, url: string, ready: Locator): Promise<number> {
  await page.goto(url, { waitUntil: "load" });
  await expect(ready).toBeVisible();
  const loadEnd = await page.evaluate(() => {
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return nav.loadEventEnd;
  });
  expect(loadEnd, "the load event has finished").toBeGreaterThan(0);
  return Math.round(loadEnd);
}

async function expectFastLoad(page: Page, network: Network, url: string, ready: Locator) {
  await logInAs(page, "owner");
  await throttle(page, network);
  await timeLoad(page, url, ready); // first visit: fills the browser cache

  const times: number[] = [];
  for (let run = 0; run < RUNS; run++) times.push(await timeLoad(page, url, ready));
  const median = [...times].sort((a, b) => a - b)[Math.floor(RUNS / 2)];
  const summary = `${network.name} ${url}: ${times.join(", ")} ms; median ${median} ms (budget ${network.budgetMs} ms)`;
  test.info().annotations.push({ type: "page-load", description: summary });
  console.log(summary);
  expect(median, summary).toBeLessThan(network.budgetMs);
}

for (const network of NETWORKS) {
  const within = `in under ${network.budgetMs / 1_000} s on a mid-range phone over ${network.name}`;

  test(`[NFR-PERF-1] the owner dashboard loads ${within}`, async ({ page }) => {
    await expectFastLoad(
      page,
      network,
      "/dashboard",
      page.getByRole("heading", { name: "Dashboard" }),
    );
  });

  test(`[NFR-PERF-1] the product list loads ${within}`, async ({ page }) => {
    await expectFastLoad(
      page,
      network,
      "/products",
      page.getByRole("heading", { name: "Products", exact: true }),
    );
  });

  test(`[NFR-PERF-1] a product page loads ${within}`, async ({ page }) => {
    await expectFastLoad(
      page,
      network,
      `/products/${topProduct.id}`,
      page.getByRole("heading", { name: topProduct.name }),
    );
  });
}
