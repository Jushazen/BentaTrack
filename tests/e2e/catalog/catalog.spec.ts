import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

/** Puts one product in a category straight into the TEST database. */
async function addProductTo(categoryName: string, code: string) {
  dotenv.config({ quiet: true });
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, 'E2E Catalog Item', $2, id, 10000, 10, now() from "Category" where name = $3`,
      [randomUUID(), code, categoryName],
    );
  } finally {
    await client.end();
  }
}

function listItem(page: Page, list: string, text: string) {
  return page.getByRole("list", { name: list }).getByRole("listitem").filter({ hasText: text });
}

test("[FR-043] the owner adds, renames, and deletes a category", async ({ page }, info) => {
  const name = `Shoes ${info.project.name}`;
  const renamed = `Footwear ${info.project.name}`;
  await logInAs(page, "owner");
  await page.goto("/categories");

  const addForm = page.getByRole("region", { name: "Add category" });
  await addForm.getByLabel("Category name").fill(name);
  await addForm.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText(`Category “${name}” added.`)).toBeVisible();
  const row = listItem(page, "Categories", name);
  await expect(row).toContainText("No products");

  // Duplicate names are refused, ignoring case.
  await addForm.getByLabel("Category name").fill(name.toUpperCase());
  await addForm.getByRole("button", { name: "Add category" }).click();
  await expect(addForm.getByText(/There is already a category called/)).toBeVisible();

  await row.getByRole("button", { name: "Rename" }).click();
  await row.getByLabel(`New name for ${name}`).fill(renamed);
  await row.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText(`Renamed to “${renamed}”.`)).toBeVisible();
  const renamedRow = listItem(page, "Categories", renamed);
  await expect(renamedRow).toBeVisible();

  await renamedRow.getByRole("button", { name: "Delete" }).click();
  await renamedRow.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText(`Category “${renamed}” deleted.`)).toBeVisible();
  await expect(listItem(page, "Categories", renamed)).toHaveCount(0);
});

test("[FR-043] a category with products shows it can't be deleted", async ({ page }, info) => {
  const name = `Perfumes ${info.project.name}`;
  await logInAs(page, "owner");
  await page.goto("/categories");
  const addForm = page.getByRole("region", { name: "Add category" });
  await addForm.getByLabel("Category name").fill(name);
  await addForm.getByRole("button", { name: "Add category" }).click();
  await expect(listItem(page, "Categories", name)).toBeVisible();

  await addProductTo(name, `E2E-CAT-${info.project.name}`);
  await page.reload();
  const row = listItem(page, "Categories", name);
  await expect(row).toContainText("1 product");
  await expect(row).toContainText("In use, so it can't be deleted");
  await expect(row.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("[FR-041] the owner adds, edits, and deletes a supplier", async ({ page }, info) => {
  const name = `Manila Leather ${info.project.name}`;
  await logInAs(page, "owner");
  await page.goto("/suppliers");

  const addForm = page.getByRole("region", { name: "Add supplier" });
  await addForm.getByLabel("Supplier name").fill(name);
  await addForm.getByLabel("Contact person").fill("Ana Reyes");
  await addForm.getByLabel("Phone").fill("0917 123 4567");
  await addForm.getByLabel("Email").fill("not-an-email");
  await addForm.getByRole("button", { name: "Add supplier" }).click();
  await expect(addForm.getByText(/Enter a valid email address/)).toBeVisible();
  await addForm.getByLabel("Email").fill("orders@manilaleather.ph");
  await addForm.getByRole("button", { name: "Add supplier" }).click();
  await expect(page.getByText(`Supplier ${name} added.`)).toBeVisible();

  const row = listItem(page, "Suppliers", name);
  await expect(row).toContainText("Ana Reyes");
  await expect(row).toContainText("0917 123 4567");
  await expect(row).toContainText("orders@manilaleather.ph");

  await row.getByRole("button", { name: "Edit" }).click();
  await row.getByLabel("Phone").fill("0998 765 4321");
  await row.getByLabel("Address").fill("Divisoria, Manila");
  await row.getByRole("button", { name: "Save supplier" }).click();
  await expect(page.getByText(`Saved ${name}.`)).toBeVisible();
  await expect(row).toContainText("0998 765 4321");
  await expect(row).toContainText("Divisoria, Manila");

  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText(`Supplier ${name} deleted.`)).toBeVisible();
  await expect(listItem(page, "Suppliers", name)).toHaveCount(0);
});

test("[FR-042-STAFF] staff are sent away from the supplier and category pages", async ({
  page,
}) => {
  await logInAs(page, "staff");
  for (const path of ["/suppliers", "/categories"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/forbidden$/);
  }
});
