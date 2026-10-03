import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
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

/**
 * Puts a product and a finished sale of it straight into the TEST database: `sold` units at
 * `price` centavos with an amount discount, recorded by the e2e staff account. Returns the ids.
 */
function insertSoldProduct(input: {
  name: string;
  code: string;
  price: number;
  sold: number;
  discount: number;
  stockAfterSale: number;
}): Promise<{ productId: string; saleId: string }> {
  return withTestDb(async (client) => {
    const productId = randomUUID();
    const saleId = randomUUID();
    const subtotal = input.price * input.sold;
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, id, $4, $5, now() from "Category" where name = 'E2E Category'`,
      [productId, input.name, input.code, input.price, input.stockAfterSale],
    );
    await client.query(
      `insert into "Sale" (id, "occurredAt", "staffId", subtotal, "discountType", "discountValue", "discountAmount", total, "paymentMethod")
       select $1, now(), id, $2, 'AMOUNT', $3, $3, $4, 'CASH' from "User" where email = $5`,
      [saleId, subtotal, input.discount, subtotal - input.discount, E2E_USERS.staff.email],
    );
    await client.query(
      `insert into "SaleItem" (id, "saleId", "productId", "productName", "productCode", quantity, "unitPrice")
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), saleId, productId, input.name, input.code, input.sold, input.price],
    );
    return { productId, saleId };
  });
}

test("[FR-039] staff give a partial refund, and the item goes back into stock", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${Date.now()}`;
  const name = `Hinabol Tote ${suffix}`;
  // 2 × ₱500 less a ₱100 discount = ₱900 paid; one returned tote is worth ₱450 of that.
  const { productId, saleId } = await insertSoldProduct({
    name,
    code: `E2E-RF-${suffix}`,
    price: 50_000,
    sold: 2,
    discount: 10_000,
    stockAfterSale: 8,
  });

  await logInAs(page, "staff");
  await page.goto(`/sales?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("heading", { name: "Sales", exact: true })).toBeVisible();
  const sales = page.getByRole("list", { name: "Sales" });
  await expect(sales.getByRole("listitem")).toHaveCount(1);
  await sales.getByRole("link", { name: /Sale of ₱900\.00/ }).click();

  await expect(page).toHaveURL(`/sales/${saleId}`);
  await expect(page.getByRole("heading", { name: "Sale of ₱900.00" })).toBeVisible();
  const quantity = page.getByLabel(`${name} refund quantity`);

  // More than was sold is flagged before anything is sent (FR-040).
  await quantity.fill("3");
  await expect(page.getByText("Only 2 can be refunded.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toBeDisabled();

  await quantity.fill("1");
  await page.getByLabel("Reason").fill("Wrong colour");
  await expect(page.getByText("Money to return (1 item): ₱450.00")).toBeVisible();
  await page.getByRole("button", { name: "Refund ₱450.00" }).click();
  await expect(
    page.getByText("Return ₱450.00 to the customer and put 1 item back in stock?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, refund" }).click();

  await expect(page.getByText("Refunded ₱450.00. Give this back to the customer.")).toBeVisible();
  await expect(page.getByText("Partly refunded")).toBeVisible();
  const refunds = page.getByRole("list", { name: "Refunds given" });
  await expect(refunds).toContainText(`1 × ${name}`);
  await expect(refunds).toContainText("₱450.00");
  await expect(refunds).toContainText("Wrong colour");
  await expect(page.getByText("1 of 2 can be refunded")).toBeVisible();
  await expect(quantity).toHaveValue("");

  // The returned tote is back on the shelf, with a Refund entry in its history.
  await page.goto(`/products/${productId}`);
  await expect(page.getByText("In stock", { exact: true }).locator("..")).toContainText("9");
  await page.goto(`/inventory-history?product=${productId}&type=REFUND`);
  const history = page.getByRole("list", { name: "Inventory changes" });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("+1");
  await expect(history).toContainText("9 in stock after");
  await expect(history).toContainText("By E2E Staff");

  const saved = await withTestDb(async (client) => {
    const { rows } = await client.query<{ amount: number; note: string; email: string }>(
      `select r.amount, r.note, u.email from "Refund" r join "User" u on u.id = r."userId"
       where r."saleId" = $1`,
      [saleId],
    );
    return rows;
  });
  expect(saved).toEqual([{ amount: 45_000, note: "Wrong colour", email: E2E_USERS.staff.email }]);
});

test("[FR-039-NO-RESTOCK] staff refund one item to stock and a damaged one not to stock, with a reason", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${Date.now()}`;
  const good = `Abaca Clutch ${suffix}`;
  const damaged = `Buri Hat ${suffix}`;
  // One sale of 1 clutch (₱400) and 1 hat (₱300), no discount: ₱700.
  const { saleId, productIds } = await withTestDb(async (client) => {
    const ids = [randomUUID(), randomUUID()];
    const sale = randomUUID();
    for (const [index, [name, price]] of (
      [
        [good, 40_000],
        [damaged, 30_000],
      ] as const
    ).entries()) {
      await client.query(
        `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
         select $1, $2, $3, id, $4, 5, now() from "Category" where name = 'E2E Category'`,
        [ids[index], name, `E2E-NR${index}-${suffix}`, price],
      );
    }
    await client.query(
      `insert into "Sale" (id, "occurredAt", "staffId", subtotal, "discountAmount", total, "paymentMethod")
       select $1, now() - interval '1 minute', id, 70000, 0, 70000, 'CASH' from "User" where email = $2`,
      [sale, E2E_USERS.staff.email],
    );
    await client.query(
      `insert into "SaleItem" (id, "saleId", "productId", "productName", "productCode", quantity, "unitPrice")
       values ($1, $3, $4, $5, $6, 1, 40000), ($2, $3, $7, $8, $9, 1, 30000)`,
      [
        randomUUID(),
        randomUUID(),
        sale,
        ids[0],
        good,
        `E2E-NR0-${suffix}`,
        ids[1],
        damaged,
        `E2E-NR1-${suffix}`,
      ],
    );
    return { saleId: sale, productIds: ids };
  });

  await logInAs(page, "staff");
  await page.goto(`/sales/${saleId}`);
  await expect(page.getByRole("heading", { name: "Sale of ₱700.00" })).toBeVisible();
  await page.getByLabel(`${good} refund quantity`).fill("1");
  await page.getByLabel(`${damaged} refund quantity`).fill("1");
  // Every item goes back to stock unless unticked.
  await expect(page.getByLabel(`Return to stock: ${good}`)).toBeChecked();
  await page.getByLabel(`Return to stock: ${damaged}`).uncheck();

  // A reason is required before anything is sent.
  await page.getByRole("button", { name: "Refund ₱700.00" }).click();
  await page.getByRole("button", { name: "Yes, refund" }).click();
  await expect(page.getByText("Enter the reason for this refund.")).toBeVisible();

  await page.getByLabel("Reason").fill("Hat brim torn");
  await page.getByRole("button", { name: "Refund ₱700.00" }).click();
  await expect(
    page.getByText(
      "Return ₱700.00 to the customer and put 1 item back in stock? 1 item won't go back in stock.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, refund" }).click();

  await expect(page.getByText("Refunded ₱700.00. Give this back to the customer.")).toBeVisible();
  const refunds = page.getByRole("list", { name: "Refunds given" });
  await expect(refunds).toContainText(`1 × ${damaged} (not returned to stock)`);
  await expect(refunds).toContainText("Hat brim torn");
  await expect(refunds).not.toContainText(`1 × ${good} (not returned to stock)`);

  // The clutch is back on the shelf (5 → 6); the torn hat isn't (stays 5), but both are logged.
  const after = await withTestDb(async (client) => {
    const { rows } = await client.query<{ id: string; stock: number; change: number }>(
      `select p.id, p."stockQuantity" as stock, c."quantityChange" as change
       from "Product" p join "InventoryChange" c on c."productId" = p.id and c.type = 'REFUND'
       where p.id = any($1::text[])`,
      [productIds],
    );
    return rows;
  });
  expect(after).toEqual(
    expect.arrayContaining([
      { id: productIds[0], stock: 6, change: 1 },
      { id: productIds[1], stock: 5, change: 0 },
    ]),
  );
  expect(after).toHaveLength(2);

  await page.goto(`/inventory-history?product=${productIds[1]}&type=REFUND`);
  const history = page.getByRole("list", { name: "Inventory changes" });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("1 not returned to stock: Hat brim torn");
});
