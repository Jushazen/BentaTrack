// A whole working day offline, end to end (FR-049, FR-034, FR-035, FR-036, FR-051, FR-053,
// FR-055; leaf 9.6). The owner signs in online once, then loses the connection. Offline they
// open every page and make every kind of change: a category, a supplier, a product (in both), a
// sale, a refund of that unsynced sale, a restock, an edit with a stock correction, and an
// archive. A staff account change is refused, since account changes need a connection (C99).
// Then the app is closed and opened again, still offline: every change is still there, queued
// in order. On reconnect they all sync in the order they were made, nothing is lost, and the
// server's data equals the device's.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { E2E_USERS, logInAs } from "../fixtures/users";

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

/** Every record in one store of the device's database (IndexedDB "bentatrack"). */
async function deviceRows<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (storeName) =>
      new Promise<T[]>((resolve) => {
        const open = indexedDB.open("bentatrack");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction(storeName).objectStore(storeName).getAll();
          all.onsuccess = () => {
            resolve(all.result as T[]);
            db.close();
          };
          all.onerror = () => resolve([]);
        };
      }),
    store,
  );
}

/** Waits until the device can work offline: worker, saved checkout and session, device data. */
async function waitUntilOfflineReady(page: Page, productId: string) {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await deviceRows<{ id: string }>(page, "products")).some((p) => p.id === productId),
      { timeout: 30_000 },
    )
    .toBe(true);
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

type Ids = {
  categoryName: string;
  supplierName: string;
  productIds: string[];
  saleId: string;
};

/** The records this test touched, as the device holds them, in a shape the server can match. */
async function deviceView(page: Page, ids: Ids) {
  type Product = Record<string, unknown> & { id: string; archivedAt: string | null };
  type Sale = { id: string; total: number; paymentMethod: string; items: SaleItem[] };
  type SaleItem = {
    productId: string | null;
    quantity: number;
    unitPrice: number;
    refundedQuantity: number;
  };
  type Change = {
    productId: string | null;
    type: string;
    quantityChange: number;
    stockAfter: number;
    occurredAt: string;
  };
  const products = (await deviceRows<Product>(page, "products"))
    .filter((p) => ids.productIds.includes(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      categoryId: p.categoryId,
      supplierId: p.supplierId,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      stockQuantity: p.stockQuantity,
      archived: p.archivedAt !== null,
    }));
  const categories = (await deviceRows<{ id: string; name: string }>(page, "categories"))
    .filter((c) => c.name === ids.categoryName)
    .map(({ id, name }) => ({ id, name }));
  const suppliers = (
    await deviceRows<{ id: string; name: string; phone: string | null }>(page, "suppliers")
  )
    .filter((s) => s.name === ids.supplierName)
    .map(({ id, name, phone }) => ({ id, name, phone }));
  const sales = (await deviceRows<Sale>(page, "sales"))
    .filter((s) => s.id === ids.saleId)
    .map((s) => ({
      id: s.id,
      total: s.total,
      paymentMethod: s.paymentMethod,
      items: s.items.map(({ productId, quantity, unitPrice, refundedQuantity }) => ({
        productId,
        quantity,
        unitPrice,
        refundedQuantity,
      })),
    }));
  const refunds = (
    await deviceRows<{ id: string; saleId: string; amount: number; note: string | null }>(
      page,
      "refunds",
    )
  )
    .filter((r) => r.saleId === ids.saleId)
    .map(({ id, amount, note }) => ({ id, amount, note }));
  const changes = (await deviceRows<Change>(page, "inventoryChanges"))
    .filter((c) => c.productId !== null && ids.productIds.includes(c.productId))
    .map(({ productId, type, quantityChange, stockAfter, occurredAt }) => ({
      productId,
      type,
      quantityChange,
      stockAfter,
      occurredAt: new Date(occurredAt).toISOString(),
    }));
  return normalize({ products, categories, suppliers, sales, refunds, changes });
}

/** The same records as the server holds them. */
function serverView(ids: Ids) {
  return withTestDb(async (client) => {
    const products = await client.query(
      `select id, name, code, "categoryId", "supplierId", "purchasePrice", "sellingPrice",
              "stockQuantity", "archivedAt" is not null as archived
         from "Product" where id = any($1)`,
      [ids.productIds],
    );
    const categories = await client.query(`select id, name from "Category" where name = $1`, [
      ids.categoryName,
    ]);
    const suppliers = await client.query(`select id, name, phone from "Supplier" where name = $1`, [
      ids.supplierName,
    ]);
    const sales = await client.query<{ id: string; total: number; paymentMethod: string }>(
      `select id, total, "paymentMethod" from "Sale" where id = $1`,
      [ids.saleId],
    );
    const items = await client.query(
      `select "productId", quantity, "unitPrice", "refundedQuantity" from "SaleItem" where "saleId" = $1`,
      [ids.saleId],
    );
    const refunds = await client.query(
      `select id, amount, note from "Refund" where "saleId" = $1`,
      [ids.saleId],
    );
    // Prisma keeps UTC in "timestamp" columns, which pg would read as local time.
    const changes = await client.query(
      `select "productId", type, "quantityChange", "stockAfter",
              to_char("occurredAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "occurredAt"
         from "InventoryChange" where "productId" = any($1)`,
      [ids.productIds],
    );
    return normalize({
      products: products.rows,
      categories: categories.rows,
      suppliers: suppliers.rows,
      sales: sales.rows.map((s) => ({ ...s, items: items.rows })),
      refunds: refunds.rows,
      changes: changes.rows,
    });
  });
}

/** Puts every list in a fixed order so two views compare by content alone. */
function normalize<T extends Record<string, unknown[]>>(view: T): T {
  const key = (row: unknown) => JSON.stringify(row, Object.keys(row as object).sort());
  const sortRows = (rows: unknown[]) =>
    rows
      .map((row) =>
        row && typeof row === "object" && "items" in row && Array.isArray(row.items)
          ? { ...row, items: [...row.items].sort((a, b) => key(a).localeCompare(key(b))) }
          : row,
      )
      .sort((a, b) => key(a).localeCompare(key(b)));
  return Object.fromEntries(
    Object.entries(view).map(([name, rows]) => [name, sortRows(rows)]),
  ) as T;
}

/** When each change reached the server, oldest first, by name. */
function serverTimeline(ids: Ids & { restockedId: string; archivedId: string }) {
  return withTestDb(async (client) => {
    const { rows } = await client.query<{ label: string }>(
      `select label from (
         select 'category' as label, "createdAt" as at from "Category" where name = $1
         union all select 'supplier', "createdAt" from "Supplier" where name = $2
         union all select 'product', "createdAt" from "Product" where id = $3
         union all select 'sale', "recordedAt" from "Sale" where id = $4
         union all select 'refund', "recordedAt" from "Refund" where "saleId" = $4
         union all select 'restock', "recordedAt" from "InventoryChange" where "productId" = $5 and type = 'RESTOCK'
         union all select 'edit', "recordedAt" from "InventoryChange" where "productId" = $5 and type = 'EDIT'
         union all select 'archive', "recordedAt" from "InventoryChange" where "productId" = $6 and type = 'ARCHIVE'
       ) t order by at`,
      [
        ids.categoryName,
        ids.supplierName,
        ids.productIds[1],
        ids.saleId,
        ids.restockedId,
        ids.archivedId,
      ],
    );
    return rows.map((r) => r.label);
  });
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, level: 1 });
const syncStatus = (page: Page) => page.getByTestId("sync-status");
const QUEUED = "It's saved on this device and will sync when you're back online.";

async function expectPage(page: Page, path: string, title: string) {
  await page.goto(path);
  await expect(heading(page, title), path).toBeVisible();
  await expect(page.getByRole("heading", { name: "You are offline" })).toHaveCount(0);
}

// Waits for the worker, goes through every page twice, and makes nine changes offline.
test.slow();

test("[FR-049-DAY] [FR-036-DAY] a whole day offline: every page and every kind of change, the app closed and reopened, then everything syncs in order with nothing lost and the server equal to the device", async ({
  page,
  context,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const toteName = `Day Abaca Tote ${suffix}`;
  const toteId = await insertProduct(toteName, `E2E-DAYA-${suffix}`);
  const fanName = `Day Rattan Fan ${suffix}`;
  const fanId = await insertProduct(fanName, `E2E-DAYC-${suffix}`);
  const categoryName = `Day Woven ${suffix}`;
  const supplierName = `Day Supplier ${suffix}`;
  const bagName = `Day Buri Bag ${suffix}`;
  const bagCode = `E2E-DAYB-${suffix}`;
  const refusedPassword = `Day-Pass-${suffix}`;

  await logInAs(page, "owner");
  await expect(page).toHaveURL(/\/dashboard/);
  await waitUntilOfflineReady(page, fanId);

  await context.setOffline(true);
  await expectNetworkCut(page);
  await expect(syncStatus(page)).toHaveText(/^Offline$/);

  // Every page opens with its data.
  await expectPage(page, "/dashboard", "Dashboard");
  await expectPage(page, "/checkout", "Checkout");
  await expectPage(page, "/sales", "Sales");
  await expectPage(page, "/reports", "Sales reports");
  await expectPage(page, `/products?q=${encodeURIComponent(toteName)}`, "Products");
  await expect(page.getByRole("link", { name: new RegExp(toteName) })).toBeVisible();
  await expectPage(page, `/products/${toteId}`, toteName);
  await expect(page.getByRole("main")).toContainText("₱450.00");
  await expectPage(page, `/products/${toteId}/edit`, `Edit ${toteName}`);
  await expect(page.getByLabel("Product name")).toHaveValue(toteName);
  await expectPage(page, "/products/new", "Add product");
  await expectPage(page, `/inventory-history?product=${toteId}`, "Inventory history");
  await expectPage(page, "/categories", "Categories");
  await expect(page.getByText("E2E Category").first()).toBeVisible();
  await expectPage(page, "/suppliers", "Suppliers");
  await expectPage(page, "/users", "User accounts");
  await expect(page.getByText(E2E_USERS.staff.email)).toBeVisible();
  await expectPage(page, "/account", "My account");
  await expect(page.getByText(`(${E2E_USERS.owner.email})`)).toBeVisible();

  // 1. A category.
  await page.goto("/categories");
  await page.getByLabel("Category name").fill(categoryName);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText(`Category “${categoryName}” added. ${QUEUED}`)).toBeVisible();

  // 2. A supplier.
  await page.goto("/suppliers");
  const addSupplier = page.getByRole("region", { name: "Add supplier" });
  await addSupplier.getByLabel("Supplier name").fill(supplierName);
  await addSupplier.getByLabel("Phone").fill("0917 555 0199");
  await addSupplier.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByText(`Supplier ${supplierName} added. ${QUEUED}`)).toBeVisible();

  // 3. A product in that category, bought from that supplier.
  await page.goto("/products/new");
  await expect(heading(page, "Add product")).toBeVisible();
  await page.getByLabel("Product name").fill(bagName);
  await page.getByLabel("Product code").fill(bagCode);
  await page.getByLabel("Category", { exact: true }).selectOption({ label: categoryName });
  await page
    .getByRole("combobox", { name: "Supplier (optional)" })
    .selectOption({ label: supplierName });
  await page.getByLabel("Purchase price (₱)").fill("600");
  await page.getByLabel("Selling price (₱)").fill("1,250");
  await page.getByLabel("Stock quantity").fill("6");
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(heading(page, bagName)).toBeVisible();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);
  const bagId = new URL(page.url()).pathname.split("/").pop()!;

  // 4. A sale of 3 × ₱450.00.
  await page.goto("/checkout");
  await expect(heading(page, "Checkout")).toBeVisible();
  await page.getByRole("combobox", { name: "Add a product" }).fill(toteName);
  await page.getByRole("option").filter({ hasText: toteName }).click();
  await page.getByRole("spinbutton", { name: `Quantity of ${toteName}` }).fill("3");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/^Sale saved on this device: ₱1,350\.00/)).toBeVisible();
  await page.goto("/sales");
  const firstSale = page.getByRole("list", { name: "Sales" }).getByRole("listitem").first();
  await expect(firstSale).toContainText("₱1,350.00");
  await expect(firstSale).toContainText("Waiting to sync");

  // 5. A refund of one unit of that sale, before it syncs.
  await firstSale.getByRole("link").click();
  await expect(heading(page, "Sale of ₱1,350.00")).toBeVisible();
  const saleId = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByLabel(`${toteName} refund quantity`).fill("1");
  await page.getByLabel("Reason").fill("Loose weave");
  await page.getByRole("button", { name: "Refund ₱450.00" }).click();
  await page.getByRole("button", { name: "Yes, refund" }).click();
  await expect(page.getByText(/^Refund of ₱450\.00 saved on this device/)).toBeVisible();

  // 6. A restock of 4: the tote now has 8 − 3 + 1 + 4 = 10 on this device.
  await page.goto(`/products/${toteId}`);
  await page.getByRole("spinbutton", { name: "Quantity received" }).fill("4");
  await page.getByRole("button", { name: "Restock" }).click();
  await expect(
    page.getByText("Restock of 4 saved on this device. It will sync when you're back online."),
  ).toBeVisible();

  // 7. An edit: a new price and a stock correction from 10 to 9.
  await page.goto(`/products/${toteId}/edit`);
  await expect(page.getByLabel("Stock quantity")).toHaveValue("10");
  await page.getByLabel("Selling price (₱)").fill("520");
  await page.getByLabel("Stock quantity").fill("9");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${toteId}$`));
  await expect(page.getByRole("main")).toContainText("₱520.00");

  // 8. An archive.
  await page.goto(`/products/${fanId}`);
  await page.getByRole("button", { name: "Archive product" }).click();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await expect(page.getByText(`${fanName} archived. ${QUEUED}`)).toBeVisible();

  // A staff account change needs a connection (C99): refused, and nothing is queued.
  await page.goto("/users");
  const addStaff = page.getByRole("region", { name: "Add staff account" });
  await addStaff.getByLabel("Name").fill(`Day Staff ${suffix}`);
  await addStaff.getByLabel("Email").fill(`day-staff-${suffix}@e2e.test`);
  await addStaff.getByLabel("Password").fill(refusedPassword);
  await addStaff.getByRole("button", { name: "Add staff account" }).click();
  await expect(
    page.getByText("Account changes need an internet connection. Connect and try again."),
  ).toBeVisible();

  await expect(syncStatus(page)).toContainText("8 waiting");

  // The app is closed and opened again, still with no connection.
  await page.close();
  const app = await context.newPage();
  await expectPage(app, "/dashboard", "Dashboard");
  await expect(syncStatus(app)).toContainText("Offline");
  await expect(syncStatus(app)).toContainText("8 waiting");
  expect(JSON.stringify(await deviceRows(app, "outbox"))).not.toContain(refusedPassword);

  // Every change is still there, queued in the order it was made.
  await syncStatus(app).click();
  const panel = app.getByRole("dialog", { name: "Sync" });
  const queued = [
    `Add category “${categoryName}”`,
    `Add supplier ${supplierName}`,
    `Add product ${bagName}`,
    "Sale of ₱1,350.00 (3 items)",
    "Refund of 1 item",
    `Restock of 4 × ${toteName}`,
    `Edit product ${toteName}`,
    `Archive ${fanName}`,
  ];
  await expect(panel.getByRole("listitem")).toHaveCount(queued.length);
  for (const [i, text] of queued.entries()) {
    await expect(panel.getByRole("listitem").nth(i)).toContainText(text);
  }
  await panel.getByRole("button", { name: "Close" }).click();

  // And still shows on every page it touched.
  await expectPage(app, "/categories", "Categories");
  await expect(app.getByRole("list", { name: "Categories" })).toContainText(categoryName);
  await expectPage(app, "/suppliers", "Suppliers");
  await expect(app.getByRole("list", { name: "Suppliers" })).toContainText(supplierName);
  await expectPage(app, `/products/${bagId}`, bagName);
  await expect(app.getByRole("main")).toContainText(categoryName);
  await expect(app.getByRole("main")).toContainText("₱1,250.00");
  await expectPage(app, `/products/${toteId}`, toteName);
  await expect(app.getByRole("main")).toContainText("₱520.00");
  await expectPage(app, `/sales/${saleId}`, "Sale of ₱1,350.00");
  await expect(app.getByRole("list", { name: "Refunds given" })).toContainText("₱450.00");
  await expectPage(app, `/products/${fanId}`, fanName);
  await expect(app.getByRole("button", { name: "Restore product" })).toBeVisible();

  // Nothing reached the server yet.
  const ids: Ids = { categoryName, supplierName, productIds: [toteId, bagId, fanId], saleId };
  const before = await serverView(ids);
  expect(before.categories).toEqual([]);
  expect(before.suppliers).toEqual([]);
  expect(before.sales).toEqual([]);
  expect(before.products.map((p) => p.id)).not.toContain(bagId);

  // Back online: everything syncs by itself.
  await context.setOffline(false);
  await expect(app.getByText("Sync complete: 8 changes saved to the server.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(syncStatus(app)).toHaveText(/^Online$/);
  expect(await deviceRows(app, "outbox")).toEqual([]);

  // In the order it was made.
  expect(await serverTimeline({ ...ids, restockedId: toteId, archivedId: fanId })).toEqual([
    "category",
    "supplier",
    "product",
    "sale",
    "refund",
    "restock",
    "edit",
    "archive",
  ]);

  // Nothing lost, and nothing extra.
  const after = await serverView(ids);
  expect(after.categories).toHaveLength(1);
  expect(after.suppliers).toEqual([expect.objectContaining({ phone: "0917 555 0199" })]);
  const product = (id: string) => after.products.find((p) => p.id === id);
  expect(product(bagId)).toMatchObject({
    name: bagName,
    code: bagCode,
    categoryId: after.categories[0]!.id,
    supplierId: after.suppliers[0]!.id,
    purchasePrice: 60_000,
    sellingPrice: 125_000,
    stockQuantity: 6,
    archived: false,
  });
  expect(product(toteId)).toMatchObject({
    sellingPrice: 52_000,
    stockQuantity: 9,
    archived: false,
  });
  expect(product(fanId)).toMatchObject({ archived: true });
  expect(after.sales).toEqual([
    {
      id: saleId,
      total: 135_000,
      paymentMethod: "CASH",
      items: [{ productId: toteId, quantity: 3, unitPrice: 45_000, refundedQuantity: 1 }],
    },
  ]);
  expect(after.refunds).toEqual([expect.objectContaining({ amount: 45_000, note: "Loose weave" })]);
  expect(
    await withTestDb(async (client) => {
      const { rowCount } = await client.query(`select 1 from "User" where email = $1`, [
        `day-staff-${suffix}@e2e.test`,
      ]);
      return rowCount;
    }),
  ).toBe(0);

  // The device, refreshed when the app opens, holds exactly what the server holds.
  await expectPage(app, "/dashboard", "Dashboard");
  await expect.poll(() => deviceView(app, ids), { timeout: 30_000 }).toEqual(after);
});
