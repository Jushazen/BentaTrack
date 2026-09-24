import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

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

test("[FR-038] staff restock a product from its page", async ({ page }, info) => {
  const name = `Woven Basket ${info.project.name}`;
  const id = await insertProduct(name, `E2E-RS-${info.project.name}`, 2);
  await logInAs(page, "staff");
  await page.goto(`/products/${id}`);

  const form = page.getByRole("form", { name: `Restock ${name}` });
  // An invalid quantity is refused with a message on the field.
  await form.getByLabel("Quantity received").fill("0");
  await form.getByRole("button", { name: "Restock" }).click();
  await expect(form.getByText("Enter at least 1 unit.")).toBeVisible();

  await form.getByLabel("Quantity received").fill("10");
  await form.getByLabel("Note").fill("Delivery from supplier");
  await form.getByRole("button", { name: "Restock" }).click();
  await expect(page.getByText(`Added 10 to ${name}. 12 in stock now.`)).toBeVisible();
  await expect(page.getByText("In stock", { exact: true }).locator("..")).toContainText("12");
  await expect(form.getByLabel("Quantity received")).toHaveValue("");
});

test("[FR-012-VIEW] the history page shows a product's restock, newest first", async ({
  page,
}, info) => {
  const name = `Abaca Bag ${info.project.name}`;
  const id = await insertProduct(name, `E2E-HI-${info.project.name}`, 1);
  await logInAs(page, "owner");
  await page.goto(`/products/${id}`);

  const form = page.getByRole("form", { name: `Restock ${name}` });
  for (const [quantity, note] of [
    ["3", "First delivery"],
    ["5", "Second delivery"],
  ]) {
    await form.getByLabel("Quantity received").fill(quantity);
    await form.getByLabel("Note").fill(note);
    await form.getByRole("button", { name: "Restock" }).click();
    await expect(page.getByText(`Added ${quantity} to ${name}.`, { exact: false })).toBeVisible();
    await expect(form.getByLabel("Quantity received")).toHaveValue("");
  }

  await page.getByRole("link", { name: "View history" }).click();
  await expect(page).toHaveURL(new RegExp(`/inventory-history\\?product=${id}$`));
  await expect(page.getByText(`Showing only ${name}`)).toBeVisible();

  const rows = page.getByRole("list", { name: "Inventory changes" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Restock");
  await expect(rows.nth(0)).toContainText("+5");
  await expect(rows.nth(0)).toContainText("9 in stock after");
  await expect(rows.nth(0)).toContainText("Second delivery");
  await expect(rows.nth(0)).toContainText("By E2E Owner");
  await expect(rows.nth(1)).toContainText("+3");
  await expect(rows.nth(1)).toContainText("4 in stock after");

  // Staff can open the history too, and filter it by product name.
  await page.context().clearCookies();
  await logInAs(page, "staff");
  await page.goto("/inventory-history");
  await page.getByLabel("Product name or code").fill(name);
  await page.getByLabel("Change type").selectOption({ label: "Restock" });
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(name);
});
