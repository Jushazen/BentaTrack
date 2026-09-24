import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

type NewProduct = {
  name: string;
  code: string;
  barcode?: string;
  /** Centavos. */
  sellingPrice: number;
  stockQuantity: number;
  lowStockThreshold?: number;
};

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
function insertProduct(product: NewProduct): Promise<string> {
  return withTestDb(async (client) => {
    const id = randomUUID();
    await client.query(
      `insert into "Product" (id, name, code, barcode, "categoryId", "sellingPrice", "stockQuantity", "lowStockThreshold", "updatedAt")
       select $1, $2, $3, $4, id, $5, $6, $7, now() from "Category" where name = 'E2E Category'`,
      [
        id,
        product.name,
        product.code,
        product.barcode ?? null,
        product.sellingPrice,
        product.stockQuantity,
        product.lowStockThreshold ?? 5,
      ],
    );
    return id;
  });
}

async function addBySearch(page: Page, text: string, name: string) {
  const search = page.getByRole("combobox", { name: "Add a product" });
  await search.fill(text);
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

const cart = (page: Page) => page.getByRole("list", { name: "Items in this sale" });

test("[CHECKOUT-FLOW] staff sell several items with a discount, GCash, and customer details", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${Date.now()}`;
  const tote = `Hinabol Tote ${suffix}`;
  const fan = `Buri Fan ${suffix}`;
  const barcode = `48${Date.now()}`.slice(0, 13);
  await insertProduct({
    name: tote,
    code: `E2E-CO-T-${suffix}`,
    sellingPrice: 50_000,
    stockQuantity: 10,
  });
  await insertProduct({
    name: fan,
    code: `E2E-CO-F-${suffix}`,
    barcode,
    sellingPrice: 25_000,
    stockQuantity: 8,
  });

  await logInAs(page, "staff");
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("No items yet. Search or scan to add products.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete sale" })).toBeDisabled();

  // By name from the search list, then a USB/Bluetooth scanner typing the barcode with no field focused.
  await addBySearch(page, `Hinabol Tote ${suffix}`, tote);
  await page.getByRole("heading", { name: "Cart" }).click();
  // Two quick scans of the same item, before the first lookup has answered, count as two.
  // Server actions POST to the page; holding them back makes both scans overlap on any machine.
  await page.route("**/checkout", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 400));
    await route.fallback();
  });
  for (let scan = 0; scan < 2; scan++) {
    await page.keyboard.type(barcode, { delay: 5 });
    await page.keyboard.press("Enter");
  }
  await expect(cart(page).getByRole("listitem")).toHaveCount(2);
  await expect(cart(page).getByLabel(`Quantity of ${fan}`)).toHaveValue("2");
  await page.unroute("**/checkout");
  await cart(page).getByLabel(`Quantity of ${fan}`).fill("1");

  await cart(page).getByLabel(`Quantity of ${tote}`).fill("2");
  const total = page.getByRole("definition").filter({ hasText: "₱" }).last();
  await expect(page.getByText("Subtotal (3 items)")).toBeVisible();
  await expect(total).toHaveText("₱1,250.00");

  // Too many units are flagged before the sale can be sent.
  await cart(page).getByLabel(`Quantity of ${fan}`).fill("9");
  await expect(cart(page).getByText("Only 8 in stock.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  await cart(page).getByLabel(`Quantity of ${fan}`).fill("1");

  // A discount larger than the subtotal is refused; 10% is accepted.
  await page.getByText("Amount (₱)").click();
  await page.getByLabel("Discount amount (₱)").fill("2000");
  await expect(page.getByText("The discount can't be more than the subtotal.")).toBeVisible();
  await page.getByText("Percent (%)").click();
  await page.getByLabel("Discount percent (%)").fill("10");
  await expect(total).toHaveText("₱1,125.00");

  await page.getByText("GCash", { exact: true }).click();
  await page.getByLabel("Customer name or contact").fill("Ana Cruz 0917 123 4567");
  await page.getByRole("button", { name: "Complete sale" }).click();

  await expect(page.getByText("Sale recorded: ₱1,125.00 by GCash.")).toBeVisible();
  await expect(page.getByText("No items yet. Search or scan to add products.")).toBeVisible();

  const saved = await withTestDb(async (client) => {
    const { rows } = await client.query<{
      total: number;
      discountType: string;
      paymentMethod: string;
      customerInfo: string;
      email: string;
      items: string;
    }>(
      `select s.total, s."discountType", s."paymentMethod", s."customerInfo", u.email,
              string_agg(i."productName" || ' x' || i.quantity, ', ' order by i."productName") as items
       from "Sale" s join "User" u on u.id = s."staffId" join "SaleItem" i on i."saleId" = s.id
       where i."productName" in ($1, $2)
       group by s.id, u.email`,
      [tote, fan],
    );
    return rows;
  });
  expect(saved).toEqual([
    {
      total: 112_500,
      discountType: "PERCENT",
      paymentMethod: "GCASH",
      customerInfo: "Ana Cruz 0917 123 4567",
      email: "staff@e2e.test",
      items: `${fan} x1, ${tote} x2`,
    },
  ]);
});

test("[NFR-STOCK-IMMEDIATE] stock shown for a product drops as soon as the sale is saved", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${Date.now()}`;
  const name = `Tikog Mat ${suffix}`;
  const id = await insertProduct({
    name,
    code: `E2E-CO-M-${suffix}`,
    sellingPrice: 30_000,
    stockQuantity: 20,
  });

  await logInAs(page, "owner");
  await page.goto("/checkout");
  await addBySearch(page, name, name);
  await cart(page).getByLabel(`Quantity of ${name}`).fill("3");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText("Sale recorded: ₱900.00 by Cash.")).toBeVisible();

  await page.goto(`/products/${id}`);
  await expect(page.getByText("In stock", { exact: true }).locator("..")).toContainText("17");

  // The search list at checkout shows the new count too.
  await page.goto("/checkout");
  await page.getByRole("combobox", { name: "Add a product" }).fill(name);
  await expect(page.getByRole("option", { name: new RegExp(name) })).toContainText("17 left");
});

test("[FR-008] a sale that brings a product to its low-stock level pops up an alert", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${Date.now()}`;
  const name = `Banig Pouch ${suffix}`;
  const id = await insertProduct({
    name,
    code: `E2E-CO-L-${suffix}`,
    sellingPrice: 15_000,
    stockQuantity: 6,
    lowStockThreshold: 5,
  });

  await logInAs(page, "staff");
  await page.goto("/checkout");
  await addBySearch(page, name, name);
  await cart(page).getByLabel(`Quantity of ${name}`).fill("2");
  await page.getByRole("button", { name: "Complete sale" }).click();

  await expect(page.getByText(`${name} is low on stock: 4 left.`)).toBeVisible();
  await page.getByRole("button", { name: "View product" }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}$`));
});
