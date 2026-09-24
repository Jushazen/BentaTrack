import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

// A real 1×1 PNG, uploaded as the product photo.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Puts a product straight into the TEST database (in the "E2E Category" from global setup). */
async function insertProduct(name: string, code: string, stockQuantity: number): Promise<string> {
  dotenv.config({ quiet: true });
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    const id = randomUUID();
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, id, 50000, $4, now() from "Category" where name = 'E2E Category'`,
      [id, name, code, stockQuantity],
    );
    return id;
  } finally {
    await client.end();
  }
}

function productRow(page: Page, name: string) {
  return page
    .getByRole("list", { name: "Products" })
    .getByRole("listitem")
    .filter({ hasText: name });
}

async function fillBasics(page: Page, name: string, code: string) {
  await page.getByLabel("Product name").fill(name);
  await page.getByLabel("Product code").fill(code);
  await page.getByLabel("Category").selectOption({ label: "E2E Category" });
  await page.getByLabel("Selling price (₱)").fill("899.50");
  await page.getByLabel("Stock quantity").fill("12");
}

test("[FR-001] the owner adds a product with a photo", async ({ page }, info) => {
  const name = `Leather Tote ${info.project.name}`;
  const code = `E2E-ADD-${info.project.name}`;
  await logInAs(page, "owner");
  await page.goto("/products");
  await page.getByRole("link", { name: "Add product" }).click();
  await expect(page).toHaveURL(/\/products\/new$/);

  // Required fields are checked before anything is saved.
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText("Enter the product name.")).toBeVisible();

  await fillBasics(page, name, code);
  await page.getByLabel("Barcode").fill(`4800${info.project.name === "phone" ? 2 : 1}`);
  await page.getByLabel("Purchase price (₱)").fill("450");
  await page
    .getByLabel("Photo")
    .setInputFiles({ name: "tote.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Photo preview" })).toBeVisible();
  await page.getByRole("button", { name: "Add product" }).click();

  await expect(page.getByText(`${name} added.`)).toBeVisible();
  await expect(page).toHaveURL(/\/products\/[^/]+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("₱899.50")).toBeVisible();
  await expect(page.getByText("₱450.00")).toBeVisible();

  // The stored photo is actually served back.
  const photo = page.getByRole("img", { name: `Photo of ${name}` });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  await page.goto(`/products?q=${encodeURIComponent(code)}`);
  await expect(productRow(page, name)).toContainText("Active");
});

test("[FR-001] staff add a product without seeing purchase price or supplier", async ({
  page,
}, info) => {
  const name = `Staff Scarf ${info.project.name}`;
  await logInAs(page, "staff");
  await page.goto("/products/new");
  await expect(page.getByLabel("Purchase price (₱)")).toHaveCount(0);
  await expect(page.getByLabel("Supplier")).toHaveCount(0);

  await fillBasics(page, name, `E2E-STAFF-${info.project.name}`);
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Purchase price")).toHaveCount(0);
});

test("[FR-003] a product is edited and the change shows immediately", async ({ page }, info) => {
  const name = `Silk Scarf ${info.project.name}`;
  const id = await insertProduct(name, `E2E-EDIT-${info.project.name}`, 10);
  await logInAs(page, "staff");
  await page.goto(`/products/${id}`);
  await page.getByRole("link", { name: "Edit product" }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}/edit$`));

  await page.getByLabel("Product name").fill(`${name} (Red)`);
  await page.getByLabel("Selling price (₱)").fill("1,250");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText(`Saved ${name} (Red).`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/products/${id}$`));
  await expect(page.getByRole("heading", { name: `${name} (Red)` })).toBeVisible();
  await expect(page.getByText("₱1,250.00")).toBeVisible();
});

test("[FR-004] only the owner deletes a discontinued product", async ({ page }, info) => {
  const name = `Old Perfume ${info.project.name}`;
  const id = await insertProduct(name, `E2E-DEL-${info.project.name}`, 3);

  await logInAs(page, "staff");
  await page.goto(`/products/${id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete product" })).toHaveCount(0);

  await page.context().clearCookies();
  await logInAs(page, "owner");
  await page.goto(`/products/${id}`);
  await page.getByRole("button", { name: "Delete product" }).click();
  await expect(page.getByText(/Delete .* permanently\?/)).toBeVisible();
  await page.getByRole("button", { name: "Yes, delete" }).click();

  await expect(page.getByText(`${name} deleted.`)).toBeVisible();
  await expect(page).toHaveURL(/\/products$/);
  await page.goto(`/products?q=${encodeURIComponent(name)}`);
  await expect(productRow(page, name)).toHaveCount(0);
});

test("[FR-006] a product at zero stock is kept and labelled Out of Stock", async ({
  page,
}, info) => {
  const name = `Empty Clutch ${info.project.name}`;
  const id = await insertProduct(name, `E2E-OUT-${info.project.name}`, 0);
  await logInAs(page, "staff");

  await page.goto(`/products?q=${encodeURIComponent(name)}`);
  const row = productRow(page, name);
  await expect(row).toContainText("Out of Stock");
  await expect(row).toContainText("0 in stock");

  await page.goto(`/products/${id}`);
  await expect(page.getByText("Out of Stock", { exact: true })).toBeVisible();
});

test("[FR-009] low stock is flagged separately from out of stock", async ({ page }, info) => {
  const tag = `Flag ${info.project.name}`;
  await insertProduct(`${tag} Low`, `E2E-LOW-${info.project.name}`, 2);
  await insertProduct(`${tag} Out`, `E2E-NONE-${info.project.name}`, 0);
  await insertProduct(`${tag} Plenty`, `E2E-OK-${info.project.name}`, 40);
  await logInAs(page, "owner");
  await page.goto(`/products?q=${encodeURIComponent(tag)}`);

  await expect(productRow(page, `${tag} Low`)).toContainText("Low Stock");
  await expect(productRow(page, `${tag} Low`)).not.toContainText("Out of Stock");
  await expect(productRow(page, `${tag} Out`)).toContainText("Out of Stock");
  await expect(productRow(page, `${tag} Plenty`)).toContainText("Active");

  const filters = page.getByRole("search", { name: "Filter products" });
  await filters.getByLabel("Stock").selectOption({ label: "Low or out of stock" });
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/stock=low/);
  await expect(productRow(page, tag)).toHaveCount(2);

  await filters.getByLabel("Stock").selectOption({ label: "Out of stock only" });
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/stock=out/);
  await expect(productRow(page, tag)).toHaveCount(1);
  await expect(productRow(page, `${tag} Out`)).toBeVisible();
});
