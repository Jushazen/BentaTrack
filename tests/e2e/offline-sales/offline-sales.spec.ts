// Sales, the dashboard, and reports offline (FR-049, leaf 9.3). With no connection, a new sale
// shows in sales history, the dashboard, and today's report, marked as waiting to sync; it can be
// refunded before it syncs; and on reconnect both reach the server, the sale first.
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
function insertProduct(name: string, code: string) {
  return withTestDb(async (client) => {
    const id = randomUUID();
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "purchasePrice", "sellingPrice", "stockQuantity", "lowStockThreshold", "updatedAt")
       select $1, $2, $3, id, 20000, 45000, 8, 2, now() from "Category" where name = 'E2E Category'`,
      [id, name, code],
    );
    return id;
  });
}

/** What the server holds for this product: its stock, sales, and refunds. */
function serverRecords(productId: string) {
  return withTestDb(async (client) => {
    const stock = await client.query<{ stockQuantity: number }>(
      `select "stockQuantity" from "Product" where id = $1`,
      [productId],
    );
    const sales = await client.query<{ saleId: string; quantity: number; total: number }>(
      `select s.id as "saleId", i.quantity, s.total from "SaleItem" i join "Sale" s on s.id = i."saleId"
       where i."productId" = $1`,
      [productId],
    );
    const refunds = await client.query<{
      saleId: string;
      quantity: number;
      amount: number;
      note: string;
      afterSale: boolean;
    }>(
      `select r."saleId", ri.quantity, r.amount, r.note, r."recordedAt" >= s."recordedAt" as "afterSale"
       from "RefundItem" ri join "Refund" r on r.id = ri."refundId"
       join "SaleItem" i on i.id = ri."saleItemId" join "Sale" s on s.id = r."saleId"
       where i."productId" = $1`,
      [productId],
    );
    return { stock: stock.rows[0]?.stockQuantity, sales: sales.rows, refunds: refunds.rows };
  });
}

/** Product codes in the device store (IndexedDB "bentatrack"). */
async function deviceProductCodes(page: Page): Promise<string[]> {
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

/** Waits until the device can work offline: worker, saved checkout and session, device data. */
async function waitUntilOfflineReady(page: Page, code: string) {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect.poll(() => deviceProductCodes(page), { timeout: 30_000 }).toContain(code);
  for (const [url, cacheName] of [
    ["/api/auth/session", "session"],
    ["/checkout", undefined],
  ] as const) {
    await expect
      .poll(
        () =>
          page.evaluate(
            ([u, c]) => caches.match(u, { cacheName: c, ignoreVary: true }).then(Boolean),
            [url, cacheName] as const,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
  }
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

/** "₱1,350.00" → 135000 centavos. */
function centavos(text: string): number {
  const match = /(-?)₱([\d,]+)\.(\d{2})/.exec(text);
  if (!match) throw new Error(`no peso amount in "${text}"`);
  const value = Number(match[2]!.replaceAll(",", "")) * 100 + Number(match[3]);
  return match[1] ? -value : value;
}

/** The value of one figure in a list of totals, in centavos. */
async function figure(list: Locator, label: string): Promise<number> {
  const stat = list.locator("div").filter({ has: list.page().getByText(label, { exact: true }) });
  return centavos(await stat.locator("dd").first().innerText());
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, level: 1 });
const syncStatus = (page: Page) => page.getByTestId("sync-status");
const waitingNote = (page: Page) => page.getByRole("status").filter({ hasText: "waiting to sync" });

async function todaysFigures(page: Page) {
  await page.goto("/reports?period=day");
  await expect(heading(page, "Sales reports")).toBeVisible();
  const totals = page.locator('dl[aria-label="Totals"]');
  const report = {
    net: await figure(totals, "Net sales"),
    sales: await figure(totals, "Sales"),
    refunds: await figure(totals, "Refunds"),
  };
  await page.goto("/dashboard");
  await expect(heading(page, "Dashboard")).toBeVisible();
  const today = page.locator(`dl[aria-label="Today's sales"]`);
  return { report, dashboard: await figure(today, "Today's sales") };
}

test("[FR-049-PENDING-VISIBLE] [FR-049-REFUND-UNSYNCED] [FR-049-REPORT-OFFLINE] offline, a new sale shows in sales history, the dashboard, and today's report, is refunded before it syncs, and both sync on reconnect", async ({
  page,
  context,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const name = `Offline Sale Tote ${suffix}`;
  const code = `E2E-OSALE-${suffix}`;
  const productId = await insertProduct(name, code);

  await logInAs(page, "owner");
  await expect(page).toHaveURL(/\/dashboard/);
  await waitUntilOfflineReady(page, code);

  await context.setOffline(true);
  await expectNetworkCut(page);
  // Today's figures on this device before the sale, drawn from the device store.
  const before = await todaysFigures(page);
  await expect(waitingNote(page)).toHaveCount(0);

  // A sale of 3 × ₱450.00, recorded with no connection.
  await page.goto("/checkout");
  await expect(heading(page, "Checkout")).toBeVisible();
  await page.getByRole("combobox", { name: "Add a product" }).fill(name);
  await page.getByRole("option").filter({ hasText: name }).click();
  await page.getByRole("spinbutton", { name: `Quantity of ${name}` }).fill("3");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/^Sale saved on this device: ₱1,350\.00/)).toBeVisible();

  // Sales history lists it first, marked as waiting to sync.
  await page.goto("/sales");
  await expect(heading(page, "Sales")).toBeVisible();
  await expect(waitingNote(page)).toContainText("Includes 1 sale or refund");
  const row = page.getByRole("list", { name: "Sales" }).getByRole("listitem").first();
  await expect(row).toContainText("₱1,350.00");
  await expect(row).toContainText("3 items · Cash");
  await expect(row).toContainText("Waiting to sync");

  // The dashboard and today's report count it.
  const afterSale = await todaysFigures(page);
  expect(afterSale.report.sales).toBe(before.report.sales + 135_000);
  expect(afterSale.report.net).toBe(before.report.net + 135_000);
  expect(afterSale.dashboard).toBe(before.dashboard + 135_000);
  const recent = page.getByRole("list", { name: "Recent sales" }).getByRole("listitem").first();
  await expect(recent).toContainText("₱1,350.00");
  await expect(recent).toContainText("Waiting to sync");
  await expect(waitingNote(page)).toBeVisible();

  // Open it from the dashboard and refund one unit before it syncs.
  await recent.getByRole("link").click();
  await expect(heading(page, "Sale of ₱1,350.00")).toBeVisible();
  const saleId = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByRole("main").getByText("Waiting to sync", { exact: true })).toBeVisible();
  await page.getByLabel(`${name} refund quantity`).fill("1");
  await page.getByLabel("Reason").fill("Wrong colour");
  await page.getByRole("button", { name: "Refund ₱450.00" }).click();
  await page.getByRole("button", { name: "Yes, refund" }).click();
  await expect(page.getByText(/^Refund of ₱450\.00 saved on this device/)).toBeVisible();
  await expect(syncStatus(page)).toContainText("2 waiting");

  // The page shows the refund straight away, and still does after a reload with no connection.
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    const refunds = page.getByRole("list", { name: "Refunds given" });
    await expect(refunds).toContainText("₱450.00");
    await expect(refunds).toContainText(`1 × ${name}`);
    await expect(refunds).toContainText("Waiting to sync");
    await expect(page.getByText("Partly refunded")).toBeVisible();
    await expect(page.getByText("1 refunded")).toBeVisible();
  }

  const afterRefund = await todaysFigures(page);
  expect(afterRefund.report.refunds).toBe(before.report.refunds + 45_000);
  expect(afterRefund.report.net).toBe(before.report.net + 90_000);
  expect(afterRefund.dashboard).toBe(before.dashboard + 90_000);

  // Nothing reached the server yet.
  expect(await serverRecords(productId)).toEqual({ stock: 8, sales: [], refunds: [] });

  // Back online: both sync by themselves, the sale first, and the server accepts the refund.
  await context.setOffline(false);
  await expect(page.getByText("Sync complete: 2 changes saved to the server.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(syncStatus(page)).toHaveText(/^Online$/);
  const server = await serverRecords(productId);
  expect(server.sales).toEqual([{ saleId, quantity: 3, total: 135_000 }]);
  expect(server.refunds).toEqual([
    { saleId, quantity: 1, amount: 45_000, note: "Wrong colour", afterSale: true },
  ]);
  expect(server.stock).toBe(6);

  // Online, the server's page shows the same sale and refund, no longer waiting.
  await page.goto(`/sales/${saleId}`);
  await expect(heading(page, "Sale of ₱1,350.00")).toBeVisible();
  await expect(page.getByRole("list", { name: "Refunds given" })).toContainText("₱450.00");
  await expect(page.getByText("Partly refunded")).toBeVisible();
  await expect(page.getByRole("main").getByText("Waiting to sync", { exact: true })).toHaveCount(0);
});
