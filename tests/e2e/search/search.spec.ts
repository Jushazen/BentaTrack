import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

/** Puts a product straight into the TEST database (in the "E2E Category" from global setup). */
async function insertProduct(name: string, code: string, barcode: string | null = null) {
  dotenv.config({ quiet: true });
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    const id = randomUUID();
    await client.query(
      `insert into "Product" (id, name, code, barcode, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, $4, id, 50000, 7, now() from "Category" where name = 'E2E Category'`,
      [id, name, code, barcode],
    );
    return id;
  } finally {
    await client.end();
  }
}

function finder(page: Page) {
  return page.getByRole("combobox", { name: "Find a product" });
}

test("[FR-026] searching by name lists matches and opens the chosen product", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const id = await insertProduct(`Mabuhay Sling ${suffix}`, `E2E-SN-${suffix}`);
  await insertProduct(`Mabuhay Visor ${suffix}`, `E2E-SV-${suffix}`);
  await logInAs(page, "staff");
  await page.goto("/products");

  await finder(page).fill(`mabuhay`);
  const options = page.getByRole("listbox", { name: "Matching products" }).getByRole("option");
  await expect(options.filter({ hasText: `Mabuhay Sling ${suffix}` })).toBeVisible();
  await expect(options.filter({ hasText: `Mabuhay Visor ${suffix}` })).toBeVisible();
  await expect(options.filter({ hasText: `Mabuhay Sling ${suffix}` })).toContainText("7 left");

  await options.filter({ hasText: `Mabuhay Sling ${suffix}` }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${id}$`));
  await expect(page.getByRole("heading", { name: `Mabuhay Sling ${suffix}` })).toBeVisible();
});

test("[FR-027] typing a product code and pressing Enter opens that product", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const id = await insertProduct(`Pandan Fan ${suffix}`, `E2E-PF-${suffix}`);
  await logInAs(page, "owner");
  await page.goto("/products");

  await finder(page).fill(`e2e-pf-${suffix}`);
  const option = page.getByRole("option").filter({ hasText: `Pandan Fan ${suffix}` });
  await expect(option).toBeVisible();
  // Keyboard selection works too.
  await finder(page).press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await finder(page).press("Escape");
  await finder(page).press("Enter");
  await expect(page).toHaveURL(new RegExp(`/products/${id}$`));
});

test("[FR-028-WEDGE] a USB/Bluetooth scanner opens the scanned product", async ({ page }, info) => {
  const n = info.project.name === "phone" ? "2" : "1";
  const stamp = String(Date.now()).slice(-8);
  const first = `48${n}${stamp}01`;
  const second = `48${n}${stamp}02`;
  const firstId = await insertProduct(`Scanned Bag ${first}`, `E2E-WA-${first}`, first);
  const secondId = await insertProduct(`Scanned Hat ${second}`, `E2E-WB-${second}`, second);
  await logInAs(page, "staff");
  await page.goto("/products");
  await expect(finder(page)).toBeVisible();

  // Nothing focused: the scanner "types" fast and presses Enter.
  await page.getByRole("heading", { name: "Products", level: 1 }).click();
  await page.keyboard.type(first, { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/products/${firstId}$`));

  // Search box focused: the scan lands in it and Enter opens the exact barcode match.
  await page.goto("/products");
  await finder(page).focus();
  await page.keyboard.type(second, { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/products/${secondId}$`));

  // An unknown barcode says so and stays on the page.
  await page.goto("/products");
  await page.getByRole("heading", { name: "Products", level: 1 }).click();
  await page.keyboard.type(`99${stamp}999`, { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(page.getByText(`No product has the barcode “99${stamp}999”.`)).toBeVisible();
  await expect(page).toHaveURL(/\/products$/);
});

test("[FR-028] the Scan barcode button is offered for the phone camera", async ({ page }) => {
  await logInAs(page, "staff");
  await page.goto("/products");
  await expect(page.getByRole("button", { name: "Scan barcode" })).toBeVisible();
});
