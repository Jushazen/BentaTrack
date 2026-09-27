import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { E2E_USERS, logInAs } from "../fixtures/users";

// Other e2e files share this database and sell things today too, so totals are compared with
// what the database holds at the moment the page is checked, and our own rows are found by name.

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

function peso(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const amount = (Math.abs(centavos) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₱${amount}`;
}

/** Manila midnight today as a UTC instant (Manila is UTC+8 all year). */
function manilaMidnight(): Date {
  const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+08:00`);
}

/**
 * A product that is out of stock and has no purchase price, plus a sale of 500 units of another
 * product made just now. Returns their names and the sale's total.
 */
function insertFixture(suffix: string) {
  return withTestDb(async (client) => {
    const empty = { id: randomUUID(), name: `Dash Empty ${suffix}`, code: `E2E-DE-${suffix}` };
    const seller = { id: randomUUID(), name: `Dash Seller ${suffix}`, code: `E2E-DS-${suffix}` };
    const price = 2_469;
    const quantity = 500;
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "purchasePrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, id, 10000, null, 0, now() from "Category" where name = 'E2E Category'`,
      [empty.id, empty.name, empty.code],
    );
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "purchasePrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, id, $4, 1000, 100, now() from "Category" where name = 'E2E Category'`,
      [seller.id, seller.name, seller.code, price],
    );
    const saleId = randomUUID();
    const total = price * quantity;
    await client.query(
      `insert into "Sale" (id, "occurredAt", "staffId", subtotal, total, "paymentMethod")
       select $1, now(), id, $2, $2, 'GCASH' from "User" where email = $3`,
      [saleId, total, E2E_USERS.staff.email],
    );
    await client.query(
      `insert into "SaleItem" (id, "saleId", "productId", "productName", "productCode", quantity, "unitPrice", "unitCost")
       values ($1, $2, $3, $4, $5, $6, $7, 1000)`,
      [randomUUID(), saleId, seller.id, seller.name, seller.code, quantity, price],
    );
    return { empty, seller, total };
  });
}

function stat(page: Page, group: string, label: string) {
  return page
    .locator(`dl[aria-label="${group}"] dt`)
    .getByText(label, { exact: true })
    .locator("xpath=..");
}

test("[FR-023] the owner sees product and stock totals and what is low on stock", async ({
  page,
}, info) => {
  const { empty } = await insertFixture(`${info.project.name}-23-${Date.now()}`);
  await logInAs(page, "owner");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const db = await withTestDb(async (client) => {
    const { rows } = await client.query<{ products: string; units: string; out: string }>(
      `select count(*) as products, coalesce(sum("stockQuantity"), 0) as units,
              count(*) filter (where "stockQuantity" <= 0) as out from "Product"`,
    );
    return rows[0];
  });
  await expect(stat(page, "Stock", "Total products")).toContainText(
    Number(db.products).toLocaleString("en-PH"),
  );
  await expect(stat(page, "Stock", "Items in stock")).toContainText(
    Number(db.units).toLocaleString("en-PH"),
  );
  await expect(stat(page, "Stock", "Out of stock")).toContainText(
    Number(db.out).toLocaleString("en-PH"),
  );

  const lowStock = page.getByRole("list", { name: "Low stock" });
  const item = lowStock.getByRole("listitem").filter({ hasText: empty.name });
  await expect(item).toContainText("0 left");
  await expect(item).toContainText("Out of Stock");

  // Staff-added products without a cost are flagged for the owner (A7 follow-on).
  await expect(page.getByRole("list", { name: "Needs cost" })).toContainText(empty.name);
});

test("[FR-024] the owner sees recent sales and this month's best sellers", async ({
  page,
}, info) => {
  const { seller, total } = await insertFixture(`${info.project.name}-24-${Date.now()}`);
  await logInAs(page, "owner");
  await page.goto("/dashboard");

  const recent = page.getByRole("list", { name: "Recent sales" });
  const newest = recent.getByRole("listitem").first();
  await expect(newest.getByRole("link")).toHaveAccessibleName(
    new RegExp(`^Sale of ${peso(total).replace(/[.$]/g, "\\$&")} on`),
  );
  await expect(newest).toContainText("500 items · GCash");
  await expect(newest).toContainText("By E2E Staff");

  const best = page.getByRole("list", { name: "Best sellers" });
  await expect(best.getByRole("listitem").filter({ hasText: seller.name })).toContainText(
    "500 sold",
  );
  await newest.getByRole("link").click();
  await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/);
});

test("[FR-025] today's sales summary matches today's sales and refunds", async ({ page }, info) => {
  await insertFixture(`${info.project.name}-25-${Date.now()}`);
  await logInAs(page, "owner");
  await page.goto("/dashboard");

  const today = await withTestDb(async (client) => {
    const start = manilaMidnight();
    const end = new Date(start.getTime() + 24 * 3600_000);
    const sales = await client.query<{ total: string; count: string }>(
      `select coalesce(sum(total), 0) as total, count(*) as count from "Sale"
       where "occurredAt" >= $1 and "occurredAt" < $2`,
      [start, end],
    );
    const refunds = await client.query<{ total: string }>(
      `select coalesce(sum(amount), 0) as total from "Refund"
       where "occurredAt" >= $1 and "occurredAt" < $2`,
      [start, end],
    );
    return {
      net: Number(sales.rows[0].total) - Number(refunds.rows[0].total),
      count: Number(sales.rows[0].count),
    };
  });
  await expect(stat(page, "Today's sales", "Today's sales")).toContainText(peso(today.net));
  await expect(stat(page, "Today's sales", "Sales made today")).toContainText(
    today.count.toLocaleString("en-PH"),
  );
});

test("[FR-023A] staff see only today's sales, low stock and recent sales", async ({ page }) => {
  await logInAs(page, "staff");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await expect(page.locator('dl[aria-label="Today\'s sales"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Low stock" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent sales" })).toBeVisible();

  await expect(page.getByText("Total products")).toHaveCount(0);
  await expect(page.getByText("Needs cost")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Best sellers/ })).toHaveCount(0);
  await expect(page.getByText(/profit/i)).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link", { name: /report/i })).toHaveCount(0);
});
