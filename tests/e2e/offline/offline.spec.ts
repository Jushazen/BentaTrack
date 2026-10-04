import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

/** Puts a product straight into the TEST database (in the "E2E Category" from global setup). */
async function insertProduct(name: string, code: string, barcode: string | null = null) {
  dotenv.config({ quiet: true });
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into "Product" (id, name, code, barcode, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, $4, id, 50000, 7, now() from "Category" where name = 'E2E Category'`,
      [randomUUID(), name, code, barcode],
    );
  } finally {
    await client.end();
  }
}

/** The service worker that controls this page, or null. */
async function controllingWorker(page: Page) {
  return page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    const registration = await navigator.serviceWorker.getRegistration();
    return controller ? { script: controller.scriptURL, scope: registration?.scope ?? "" } : null;
  });
}

/** Product codes in the device's offline catalog (IndexedDB "bentatrack", store "products"). */
async function offlineCatalogCodes(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("bentatrack");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("products")) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction("products").objectStore("products").getAll();
          all.onsuccess = () => {
            resolve((all.result as { code: string }[]).map((p) => p.code));
            db.close();
          };
          all.onerror = () => resolve([]);
        };
      }),
  );
}

/**
 * Whether any service worker cache holds `path`. Vary is ignored because Next varies pages on
 * Accept-Encoding, which a request made from the page doesn't carry; precached entries also
 * carry a revision query, so `ignoreSearch` is available for those.
 */
async function isPageCached(page: Page, path: string, ignoreSearch = false): Promise<boolean> {
  return page.evaluate(
    async ([url, ignore]) =>
      Boolean(await caches.match(url, { ignoreVary: true, ignoreSearch: ignore })),
    [path, ignoreSearch] as const,
  );
}

/** Waits until the service worker controls the page and has saved `pages` for offline use. */
async function waitUntilOfflineReady(page: Page, pages: string[]) {
  await expect.poll(() => controllingWorker(page), { timeout: 30_000 }).not.toBeNull();
  for (const path of pages) {
    await expect.poll(() => isPageCached(page, path), { timeout: 30_000 }).toBe(true);
  }
}

/** Whose data the device store holds (IndexedDB meta "snapshotRole"), or null. */
async function deviceDataRole(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const open = indexedDB.open("bentatrack");
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("meta")) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction("meta").objectStore("meta").get("snapshotRole");
          get.onsuccess = () => {
            resolve((get.result as { value: string } | undefined)?.value ?? null);
            db.close();
          };
          get.onerror = () => resolve(null);
        };
      }),
  );
}

/**
 * Waits until the offline app can draw this user's pages (leaves 9.2, 9.3): the session is saved
 * and the device store holds their data.
 */
async function waitUntilDrawnOffline(page: Page, role: "OWNER" | "STAFF") {
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          Boolean(await caches.match("/api/auth/session", { cacheName: "session" })),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect.poll(() => deviceDataRole(page), { timeout: 30_000 }).toBe(role);
}

/** Positive control: with the network cut, a request that is never cached must fail. */
async function expectNetworkCut(page: Page) {
  const outcome = await page.evaluate(() =>
    fetch("/api/catalog", { cache: "no-store" }).then(
      (response) => `status ${response.status}`,
      () => "failed",
    ),
  );
  expect(outcome).toBe("failed");
}

async function logOut(page: Page, info: TestInfo) {
  if (info.project.name === "phone") {
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "More pages" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Log out" }).locator("visible=true").click();
  await expect(page).toHaveURL(/\/login/);
}

test("[PWA-SW] a service worker controls the app for the whole site", async ({ page }) => {
  await page.goto("/login");
  await expect.poll(() => controllingWorker(page), { timeout: 30_000 }).not.toBeNull();
  const worker = await controllingWorker(page);
  const origin = new URL(page.url()).origin;
  expect(worker?.script).toBe(`${origin}/serwist/sw.js`);
  expect(worker?.scope).toBe(`${origin}/`);

  // The offline page is precached at install, so it opens before it was ever visited.
  await expect.poll(() => isPageCached(page, "/offline", true), { timeout: 30_000 }).toBe(true);
});

test("[PWA-MANIFEST] the web app manifest is linked and installable, with real PNG icons", async ({
  page,
}) => {
  await page.goto("/login");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };
  expect(manifest.name).toContain("BentaTrack");
  expect(manifest.short_name).toBe("BentaTrack");
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");

  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    const file = await page.request.get(icon.src);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()["content-type"]).toBe("image/png");
    const png = await file.body();
    // PNG signature, then the IHDR chunk's width and height must match the declared size.
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const [width, height] = icon.sizes.split("x").map(Number);
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
  }
});

test("[FR-050] [OFFLINE-CATALOG] after one online login, checkout reloads and finds products offline", async ({
  page,
  context,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const name = `Offline Banig Bag ${suffix}`;
  const code = `E2E-OFF-${suffix}`;
  const barcode = `49${Date.now()}`.slice(0, 13);
  await insertProduct(name, code, barcode);

  await logInAs(page, "staff");
  await expect(page).toHaveURL(/\/dashboard/);
  // Checkout was never opened on this device: it must be saved for offline use anyway.
  await waitUntilOfflineReady(page, ["/checkout"]);
  await expect.poll(() => offlineCatalogCodes(page), { timeout: 30_000 }).toContain(code);
  // Who is signed in is saved too, so the offline app can draw unsaved pages (leaf 9.2).
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          Boolean(await caches.match("/api/auth/session", { cacheName: "session" })),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);

  await context.setOffline(true);
  await expectNetworkCut(page);

  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();

  // Live search by name comes from the device's catalog.
  const search = page.getByRole("combobox", { name: "Add a product" });
  await search.fill(`banig bag ${suffix}`);
  const option = page.getByRole("option").filter({ hasText: name });
  await expect(option).toBeVisible();
  await expect(option).toContainText("7 left");
  await option.click();
  await expect(page.getByRole("list", { name: "Items in this sale" })).toContainText(name);

  // So does an exact barcode typed or scanned into the box.
  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await search.fill(barcode);
  await search.press("Enter");
  await expect(page.getByRole("list", { name: "Items in this sale" })).toContainText(name);

  // A page never opened on this device opens from the device store (FR-049, leaf 9.2; it showed
  // the offline notice before SRS v2.1). The notice is covered by [OFFLINE-USER-SWITCH].
  await page.goto("/inventory-history");
  await expect(page.getByRole("heading", { name: "Inventory history", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You are offline" })).toHaveCount(0);

  await context.setOffline(false);
});

/** Follows one of the app's own menu links (the phone tab bar keeps some behind "More"). */
async function followMenuLink(page: Page, label: string, info: TestInfo) {
  const link = page.getByRole("link", { name: label, exact: true }).locator("visible=true");
  if (info.project.name === "phone" && (await link.count()) === 0) {
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "More pages" })).toBeVisible();
  }
  await link.first().click();
}

const MENU_PAGES = [
  { path: "/checkout", link: "Checkout", heading: "Checkout" },
  { path: "/sales", link: "Sales", heading: "Sales" },
  { path: "/inventory-history", link: "Inventory history", heading: "Inventory history" },
  { path: "/reports", link: "Reports", heading: "Sales reports" },
];

test("[FR-050] [OFFLINE-LINKS] pages opened through the app's links open again offline, by link or address", async ({
  page,
  context,
}, info) => {
  // It waits up to 30 s for the worker to install, then for saved pages and device data; under a
  // long run the first install alone can take most of the default 30 s test budget (leaf 9.7).
  test.slow();
  await logInAs(page, "owner");
  await expect.poll(() => controllingWorker(page), { timeout: 30_000 }).not.toBeNull();
  for (const { path, link, heading } of MENU_PAGES) {
    await followMenuLink(page, link, info);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
  // Only checkout is kept as a saved copy; the other pages are drawn by the offline app from the
  // device store (leaves 9.2, 9.3).
  await waitUntilOfflineReady(page, ["/checkout"]);
  await waitUntilDrawnOffline(page, "OWNER");

  await context.setOffline(true);
  await expectNetworkCut(page);

  // Back and forth through the menu, as reported on an iPhone (Checkout → Sales → Checkout …).
  for (const { path, link, heading } of [...MENU_PAGES, ...MENU_PAGES]) {
    await followMenuLink(page, link, info);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "You are offline" })).toHaveCount(0);
  }
  for (const { path, heading } of MENU_PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }

  await context.setOffline(false);
});

test("[FR-050] [OFFLINE-VARY] a saved page is served offline whatever headers the browser sends for it", async ({
  page,
  context,
}) => {
  await logInAs(page, "staff");
  await waitUntilOfflineReady(page, ["/checkout"]);
  await context.setOffline(true);
  await expectNetworkCut(page);

  // Next.js marks pages `Vary: Next-Router-State-Tree, …, Accept-Encoding`. Safari's own page
  // requests don't match a page saved ahead of time on those headers; a request that differs on
  // one must still get the saved page.
  const outcome = await page.evaluate(() =>
    fetch("/checkout", { headers: { "Next-Router-State-Tree": "differs" } }).then(
      async (response) => `${response.status} ${(await response.text()).includes("Checkout")}`,
      () => "failed",
    ),
  );
  expect(outcome).toBe("200 true");

  await context.setOffline(false);
});

test("[OFFLINE-USER-SWITCH] signing in as someone else clears the previous user's saved pages", async ({
  page,
  context,
}, info) => {
  await logInAs(page, "owner");
  await waitUntilOfflineReady(page, ["/checkout"]);
  await waitUntilDrawnOffline(page, "OWNER");

  // Control: the owner's report page does open offline while the owner is signed in. It is drawn
  // by the offline app from the device store (leaf 9.3), not kept as a saved copy.
  await context.setOffline(true);
  await expectNetworkCut(page);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Sales reports", level: 1 })).toBeVisible();
  await context.setOffline(false);

  await page.goto("/dashboard");
  await logOut(page, info);
  expect(await isPageCached(page, "/checkout")).toBe(false);
  expect(await isPageCached(page, "/api/auth/session")).toBe(false);

  await logInAs(page, "staff");
  await waitUntilOfflineReady(page, ["/checkout"]);
  await waitUntilDrawnOffline(page, "STAFF");
  await context.setOffline(true);
  await expectNetworkCut(page);
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "You don't have access to this page" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales reports" })).toHaveCount(0);
  await context.setOffline(false);
});
