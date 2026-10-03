// End-to-end flows across features (leaf 7.1): the SRS §2.1 system flow, a product's whole
// history (FR-012), and who did what (§5.2). Other e2e files share this database and sell things
// today too; tests run one at a time, so today's totals are read just before our sale and the
// page must show exactly that plus our sale.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { E2E_USERS, logIn, logInAs } from "../fixtures/users";

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
function insertProduct(product: {
  name: string;
  code: string;
  barcode?: string;
  sellingPrice: number;
  stockQuantity: number;
}): Promise<string> {
  return withTestDb(async (client) => {
    const id = randomUUID();
    await client.query(
      `insert into "Product" (id, name, code, barcode, "categoryId", "sellingPrice", "purchasePrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, $4, id, $5, 20000, $6, now() from "Category" where name = 'E2E Category'`,
      [
        id,
        product.name,
        product.code,
        product.barcode ?? null,
        product.sellingPrice,
        product.stockQuantity,
      ],
    );
    return id;
  });
}

/** Today's sales less today's refunds, in centavos, with "today" in Manila time (UTC+8). */
function todaysNetSales(): Promise<number> {
  return withTestDb(async (client) => {
    const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00+08:00`);
    const end = new Date(start.getTime() + 24 * 3600_000);
    const { rows } = await client.query<{ net: string }>(
      `select (select coalesce(sum(total), 0) from "Sale" where "occurredAt" >= $1 and "occurredAt" < $2)
            - (select coalesce(sum(amount), 0) from "Refund" where "occurredAt" >= $1 and "occurredAt" < $2)
         as net`,
      // ISO strings: node-pg would send Dates as local time with an offset, which a timestamp
      // (without time zone) column drops, shifting the day by the machine's UTC offset.
      [start.toISOString(), end.toISOString()],
    );
    return Number(rows[0].net);
  });
}

function peso(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const amount = (Math.abs(centavos) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₱${amount}`;
}

function stat(page: Page, group: string, label: string) {
  return page
    .locator(`dl[aria-label="${group}"] dt`)
    .getByText(label, { exact: true })
    .locator("xpath=..");
}

const cart = (page: Page) => page.getByRole("list", { name: "Items in this sale" });

test("[FLOW-SYSTEM] staff log in, scan and sell; stock, dashboard and reports show the sale", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${Date.now()}`;
  const name = `Flow Tote ${suffix}`;
  const barcode = `47${Date.now()}`.slice(0, 13);
  const id = await insertProduct({
    name,
    code: `E2E-FLOW-${suffix}`,
    barcode,
    sellingPrice: 75_000,
    stockQuantity: 10,
  });
  const before = await todaysNetSales();

  // Log in (§2.1 step 1).
  await page.goto("/login");
  await logIn(page, E2E_USERS.staff.email);
  await expect(page).toHaveURL(/\/dashboard$/);

  // Scan with a USB/Bluetooth scanner (it types the barcode and Enter), take two, and sell.
  await page.goto("/checkout");
  await expect(page.getByText("No items yet. Search or scan to add products.")).toBeVisible();
  await page.getByRole("heading", { name: "Cart" }).click();
  await page.keyboard.type(barcode, { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(cart(page).getByLabel(`Quantity of ${name}`)).toHaveValue("1");
  await cart(page).getByLabel(`Quantity of ${name}`).fill("2");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText("Sale recorded: ₱1,500.00 by Cash.")).toBeVisible();

  // Stock is deducted.
  await page.goto(`/products/${id}`);
  await expect(page.getByText("In stock", { exact: true }).locator("..")).toContainText("8");

  // The staff dashboard shows the sale in today's total and at the top of recent sales.
  const after = peso(before + 150_000);
  await page.goto("/dashboard");
  await expect(stat(page, "Today's sales", "Today's sales")).toContainText(after);
  const newest = page.getByRole("list", { name: "Recent sales" }).getByRole("listitem").first();
  await expect(newest.getByRole("link")).toHaveAccessibleName(/^Sale of ₱1,500\.00 on/);
  await expect(newest).toContainText("By E2E Staff");

  // The owner sees it on their dashboard and in today's report.
  await page.context().clearCookies();
  await logInAs(page, "owner");
  await page.goto("/dashboard");
  await expect(stat(page, "Today's sales", "Today's sales")).toContainText(after);
  await page.goto("/reports?period=day");
  await expect(page.getByRole("heading", { name: "Sales reports" })).toBeVisible();
  await expect(stat(page, "Totals", "Net sales")).toContainText(after);
  const best = page.getByRole("list", { name: "Best sellers" });
  await expect(best.getByRole("listitem").filter({ hasText: name })).toContainText("2 sold");
});

test("[FR-012] [NFR-SEC-2] a product's history shows its sale, restock, edit, refund and archiving, each by the user who made it", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${Date.now()}`;
  const name = `Lifecycle Bag ${suffix}`;
  const renamed = `${name} (Brown)`;
  const code = `E2E-LC-${suffix}`;
  const id = await insertProduct({ name, code, sellingPrice: 50_000, stockQuantity: 10 });

  // Staff sell two (10 → 8).
  await logInAs(page, "staff");
  await page.goto("/checkout");
  await page.getByRole("combobox", { name: "Add a product" }).fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await cart(page).getByLabel(`Quantity of ${name}`).fill("2");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText("Sale recorded: ₱1,000.00 by Cash.")).toBeVisible();

  // Staff restock five (8 → 13).
  await page.goto(`/products/${id}`);
  const restock = page.getByRole("form", { name: `Restock ${name}` });
  await restock.getByLabel("Quantity received").fill("5");
  await restock.getByLabel("Note").fill("Weekly delivery");
  await restock.getByRole("button", { name: "Restock" }).click();
  await expect(page.getByText(`Added 5 to ${name}. 13 in stock now.`)).toBeVisible();

  // Staff edit its details (stock unchanged).
  await page.getByRole("link", { name: "Edit product" }).click();
  await page.getByLabel("Product name").fill(renamed);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`Saved ${renamed}.`)).toBeVisible();

  // Staff refund one of the two sold (13 → 14).
  const saleId = await withTestDb(async (client) => {
    const { rows } = await client.query<{ saleId: string }>(
      `select "saleId" from "SaleItem" where "productId" = $1`,
      [id],
    );
    return rows[0].saleId;
  });
  await page.goto(`/sales/${saleId}`);
  await page.getByLabel(/refund quantity$/).fill("1");
  await page.getByLabel("Reason").fill("Wrong size");
  await page.getByRole("button", { name: "Refund ₱500.00" }).click();
  await page.getByRole("button", { name: "Yes, refund" }).click();
  await expect(page.getByText("Refunded ₱500.00. Give this back to the customer.")).toBeVisible();

  // The owner archives it as discontinued (stock kept at 14).
  await page.context().clearCookies();
  await logInAs(page, "owner");
  await page.goto(`/products/${id}`);
  await page.getByRole("button", { name: "Archive product" }).click();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await expect(page.getByText(`${renamed} archived.`)).toBeVisible();

  // The history is kept: all five changes, newest first, each with who made it.
  await page.goto(`/inventory-history?q=${encodeURIComponent(code)}`);
  const rows = page.getByRole("list", { name: "Inventory changes" }).getByRole("listitem");
  await expect(rows).toHaveCount(5);
  const expected = [
    { type: "Archive", change: "0", after: "14 in stock after", by: "By E2E Owner" },
    { type: "Refund", change: "+1", after: "14 in stock after", by: "By E2E Staff" },
    { type: "Edit", change: "0", after: "13 in stock after", by: "By E2E Staff" },
    { type: "Restock", change: "+5", after: "13 in stock after", by: "By E2E Staff" },
    { type: "Sale", change: "-2", after: "8 in stock after", by: "By E2E Staff" },
  ];
  for (const [i, row] of expected.entries()) {
    await expect(rows.nth(i)).toContainText(row.type);
    await expect(rows.nth(i)).toContainText(row.change);
    await expect(rows.nth(i)).toContainText(row.after);
    await expect(rows.nth(i)).toContainText(row.by);
    await expect(rows.nth(i)).toContainText(code);
  }

  // Every record behind those rows names its user (§5.2).
  const saved = await withTestDb(async (client) => {
    const changes = await client.query<{ type: string; email: string; productId: string | null }>(
      `select c.type, u.email, c."productId" from "InventoryChange" c join "User" u on u.id = c."userId"
       where c."productCode" = $1 order by c."occurredAt"`,
      [code],
    );
    const sale = await client.query<{ email: string }>(
      `select u.email from "Sale" s join "User" u on u.id = s."staffId" where s.id = $1`,
      [saleId],
    );
    const refunds = await client.query<{ email: string }>(
      `select u.email from "Refund" r join "User" u on u.id = r."userId" where r."saleId" = $1`,
      [saleId],
    );
    return { changes: changes.rows, sale: sale.rows, refunds: refunds.rows };
  });
  const staff = E2E_USERS.staff.email;
  expect(saved.changes).toEqual([
    { type: "SALE", email: staff, productId: id },
    { type: "RESTOCK", email: staff, productId: id },
    { type: "EDIT", email: staff, productId: id },
    { type: "REFUND", email: staff, productId: id },
    { type: "ARCHIVE", email: E2E_USERS.owner.email, productId: id },
  ]);
  expect(saved.sale).toEqual([{ email: staff }]);
  expect(saved.refunds).toEqual([{ email: staff }]);
});
