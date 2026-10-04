import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

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

/** Puts a product straight into the TEST database (in the "E2E Category" from global setup). */
function insertProduct(name: string, code: string, stockQuantity: number, sellingPrice: number) {
  return withTestDb(async (client) => {
    const id = randomUUID();
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, id, $4, $5, now() from "Category" where name = 'E2E Category'`,
      [id, name, code, sellingPrice, stockQuantity],
    );
    return id;
  });
}

function stockOf(productId: string): Promise<number> {
  return withTestDb(async (client) => {
    const { rows } = await client.query<{ stockQuantity: number }>(
      `select "stockQuantity" from "Product" where id = $1`,
      [productId],
    );
    return rows[0].stockQuantity;
  });
}

function setStock(productId: string, stockQuantity: number) {
  return withTestDb((client) =>
    client.query(`update "Product" set "stockQuantity" = $2 where id = $1`, [
      productId,
      stockQuantity,
    ]),
  );
}

/** Sales of this product: one row per sale, with what the server stored. */
function salesOf(productId: string) {
  return withTestDb(async (client) => {
    const { rows } = await client.query<{
      quantity: number;
      paymentMethod: string;
      occurredAtMs: number;
      staffEmail: string;
    }>(
      // Prisma stores UTC in a column without a time zone; epoch keeps pg from reading it as local.
      `select i.quantity, s."paymentMethod", extract(epoch from s."occurredAt") * 1000 as "occurredAtMs", u.email as "staffEmail"
         from "SaleItem" i join "Sale" s on s.id = i."saleId" join "User" u on u.id = s."staffId"
        where i."productId" = $1`,
      [productId],
    );
    return rows.map((row) => ({ ...row, occurredAtMs: Number(row.occurredAtMs) }));
  });
}

function restocksOf(productId: string) {
  return withTestDb(async (client) => {
    const { rows } = await client.query<{ quantityChange: number }>(
      `select "quantityChange" from "InventoryChange" where "productId" = $1 and type = 'RESTOCK'`,
      [productId],
    );
    return rows.map((row) => row.quantityChange);
  });
}

async function isPageCached(page: Page, path: string): Promise<boolean> {
  return page.evaluate(async (url) => Boolean(await caches.match(url, { ignoreVary: true })), path);
}

/** Product codes in the device's offline catalog. */
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

/** Waits until the service worker controls the page, has saved `pages`, and has the catalog. */
async function waitUntilOfflineReady(page: Page, pages: string[], code: string) {
  // If the worker finished activating while this page was still loading, Chrome may not hand the
  // page to it until the next page load (leaf 9.7). A user's next page is controlled; do the same.
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration())?.active),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  const claimed = await page
    .waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 5_000 })
    .then(
      () => true,
      () => false,
    );
  if (!claimed) await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  for (const path of pages) {
    await expect.poll(() => isPageCached(page, path), { timeout: 30_000 }).toBe(true);
  }
  await expect.poll(() => offlineCatalogCodes(page), { timeout: 30_000 }).toContain(code);
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

async function sellOffline(page: Page, name: string, quantity: number) {
  await page.getByRole("combobox", { name: "Add a product" }).fill(name);
  await page.getByRole("option").filter({ hasText: name }).click();
  await page.getByRole("spinbutton", { name: `Quantity of ${name}` }).fill(String(quantity));
  await page.getByRole("radio", { name: "GCash" }).check();
  await page.getByRole("button", { name: "Complete sale" }).click();
}

const syncStatus = (page: Page) => page.getByTestId("sync-status");

test("[FR-034] [FR-035] [FR-036] [FR-051] [SYNC-NOTIFY] a sale and a restock made offline survive a reload and sync once on reconnect", async ({
  page,
  context,
}, info) => {
  // It waits up to 30 s each for the worker to install, the saved pages, and the catalog; under a
  // long run the first install alone can take most of the default 30 s test budget (leaf 9.7).
  test.slow();
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const name = `Sync Abaca Bag ${suffix}`;
  const code = `E2E-SYNC-${suffix}`;
  const productId = await insertProduct(name, code, 6, 45_000);

  await logInAs(page, "staff");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/products/${productId}`);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  // Product pages open offline from the device store (leaf 9.2) once the worker has saved who
  // is signed in; they are no longer kept as saved copies.
  await waitUntilOfflineReady(page, ["/checkout"], code);
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          Boolean(await caches.match("/api/auth/session", { cacheName: "session" })),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(syncStatus(page)).toHaveText(/^Online$/);

  await context.setOffline(true);
  await expectNetworkCut(page);
  await expect(syncStatus(page)).toHaveText(/^Offline$/);

  // A sale: saved on the device, the cart clears, and the indicator counts it.
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
  const recordedAt = Date.now();
  await sellOffline(page, name, 2);
  await expect(
    page.getByText(
      "Sale saved on this device: ₱900.00 by GCash. It will sync when you're back online.",
    ),
  ).toBeVisible();
  await expect(page.getByText("No items yet. Search or scan to add products.")).toBeVisible();
  await expect(syncStatus(page)).toContainText("1 waiting");

  // The device's catalog already shows the units that left.
  await page.getByRole("combobox", { name: "Add a product" }).fill(name);
  await expect(page.getByRole("option").filter({ hasText: name })).toContainText("4 left");

  // A restock, on a page reloaded without a connection.
  await page.goto(`/products/${productId}`);
  await page.getByRole("spinbutton", { name: "Quantity received" }).fill("5");
  await page.getByRole("button", { name: "Restock" }).click();
  await expect(
    page.getByText("Restock of 5 saved on this device. It will sync when you're back online."),
  ).toBeVisible();
  await expect(syncStatus(page)).toContainText("2 waiting");

  // Nothing is lost by reloading, and nothing reached the server yet.
  await page.reload();
  await expect(syncStatus(page)).toContainText("Offline");
  await expect(syncStatus(page)).toContainText("2 waiting");
  expect(await salesOf(productId)).toEqual([]);
  expect(await stockOf(productId)).toBe(6);

  await syncStatus(page).click();
  const panel = page.getByRole("dialog", { name: "Sync" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("listitem").nth(0)).toContainText("Sale of ₱900.00 (2 items)");
  await expect(panel.getByRole("listitem").nth(1)).toContainText(`Restock of 5 × ${name}`);
  await expect(panel.getByText("Waiting to sync.")).toHaveCount(2);
  await expect(panel.getByRole("button", { name: "Sync now" })).toBeDisabled();
  await panel.getByRole("button", { name: "Close" }).click();

  // Back online: both sync by themselves, in order, and the user is told.
  await context.setOffline(false);
  await expect(page.getByText("Sync complete: 2 changes saved to the server.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(`${name} is low on stock: 4 left.`)).toBeVisible();
  await expect(syncStatus(page)).toHaveText(/^Online$/);

  const sales = await salesOf(productId);
  expect(sales).toHaveLength(1);
  expect(sales[0]).toMatchObject({ quantity: 2, paymentMethod: "GCASH" });
  expect(sales[0].staffEmail).toMatch(/staff/i);
  // Stored with the time it happened on the device, not the time it synced.
  expect(Math.abs(sales[0].occurredAtMs - recordedAt)).toBeLessThan(15_000);
  expect(await restocksOf(productId)).toEqual([5]);
  expect(await stockOf(productId)).toBe(9);

  // Another reconnect finds nothing left to send: still exactly one sale and one restock.
  await context.setOffline(true);
  await context.setOffline(false);
  await page.reload();
  await expect(syncStatus(page)).toHaveText(/^Online$/);
  expect(await salesOf(productId)).toHaveLength(1);
  expect(await restocksOf(productId)).toEqual([5]);
});

test("[SYNC-NOTIFY] [FR-036] when the server refuses an offline sale, the user is told why and it is kept until discarded", async ({
  page,
  context,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const name = `Sync Buri Mat ${suffix}`;
  const code = `E2E-SYNC-R-${suffix}`;
  const productId = await insertProduct(name, code, 3, 50_000);

  await logInAs(page, "staff");
  await expect(page).toHaveURL(/\/dashboard/);
  await waitUntilOfflineReady(page, ["/checkout"], code);

  await context.setOffline(true);
  await expectNetworkCut(page);
  await page.goto("/checkout");
  await sellOffline(page, name, 3);
  await expect(page.getByText(/^Sale saved on this device: ₱1,500\.00 by GCash/)).toBeVisible();

  // Meanwhile the shelf was counted again and only 1 is really left.
  await setStock(productId, 1);
  await context.setOffline(false);

  await expect(page.getByText("1 change couldn't sync. Open “Sync” to see why.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(syncStatus(page)).toContainText("1 waiting");
  expect(await salesOf(productId)).toEqual([]);

  // Kept, with the reason, across a reload.
  await page.reload();
  await expect(syncStatus(page)).toContainText("1 waiting");
  await syncStatus(page).click();
  const panel = page.getByRole("dialog", { name: "Sync" });
  const entry = panel.getByRole("listitem").filter({ hasText: "Sale of ₱1,500.00 (3 items)" });
  await expect(entry).toContainText("Couldn't sync: Not enough stock for this sale.");

  // "Sync now" tries again and says so when it is still refused.
  await panel.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("1 change couldn't sync. Open “Sync” to see why.")).toBeVisible();
  expect(await salesOf(productId)).toEqual([]);

  await entry.getByRole("button", { name: "Discard" }).click();
  await entry.getByRole("button", { name: "Yes, discard" }).click();
  await expect(page.getByText("Discarded. It won't be sent to the server.")).toBeVisible();
  await expect(panel.getByText("Everything is synced.")).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(syncStatus(page)).toHaveText(/^Online$/);
  expect(await stockOf(productId)).toBe(1);
});
