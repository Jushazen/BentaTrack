import { expect, test, type Page, type TestInfo } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { logInAs } from "../fixtures/users";

const OWNER_ONLY = ["Reports", "Categories", "Suppliers", "Users"];
const OWNER_PAGES = [
  "/dashboard",
  "/checkout",
  "/sales",
  "/products",
  "/inventory-history",
  "/reports",
  "/categories",
  "/suppliers",
  "/users",
];
const STAFF_PAGES = ["/dashboard", "/checkout", "/sales", "/products", "/inventory-history"];

const isPhone = (info: TestInfo) => info.project.name === "phone";

/** On phones the full menu lives in the "More" sheet; on desktop it's the sidebar. */
async function openFullMenu(page: Page, info: TestInfo) {
  if (isPhone(info)) {
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "More pages" })).toBeVisible();
  }
}

/** Every visible link and button must show text (SRS §2.5: never icon-only). */
async function expectVisibleTextOnAllControls(page: Page, where: string) {
  const controls = page.locator("a:visible, button:visible");
  const count = await controls.count();
  expect(count, where).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    const text = (await control.innerText()).trim();
    const html = await control.evaluate((el) => el.outerHTML.slice(0, 160));
    expect(text.length, `${where}: control without visible text: ${html}`).toBeGreaterThan(0);
  }
}

// One product at or below its threshold, so the app has something to announce (FR-007).
// Other suites add low-stock products to the same test database, so the expected count is read
// back with the app's rule (quantity at or below the product's own threshold).
let lowStock = 0;
test.beforeAll(async () => {
  dotenv.config({ quiet: true });
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `select id from "Category" where name = 'E2E Category'`,
    );
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "stockQuantity", "lowStockThreshold", "updatedAt")
       values ($1, 'E2E Low Scarf', 'E2E-LOW-1', $2, 50000, 2, 5, now())
       on conflict (code) do update set "stockQuantity" = 2, "lowStockThreshold" = 5`,
      [randomUUID(), rows[0].id],
    );
    const count = await client.query<{ n: number }>(
      `select count(*)::int as n from "Product" where "stockQuantity" <= "lowStockThreshold"`,
    );
    lowStock = count.rows[0].n;
  } finally {
    await client.end();
  }
});

test("[UI-LOGO] the Estetika wordmark shows in the shell and on the login page", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.locator('[data-testid="wordmark"]:visible')).toContainText("Estetika");
  await logInAs(page, "staff");
  await expect(page.locator('[data-testid="wordmark"]:visible').first()).toContainText("Estetika");
});

test("[UI-NAV-ROLE] staff never see owner-only pages in any menu", async ({ page }, info) => {
  await logInAs(page, "staff");
  await openFullMenu(page, info);
  await expect(
    page.getByRole("link", { name: "Products" }).locator("visible=true").first(),
  ).toBeVisible();
  for (const label of OWNER_ONLY) {
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("Owner", { exact: true }).locator("visible=true")).toHaveCount(0);
});

test("[UI-NAV-ROLE] the owner sees and can open every owner-only page from the menu", async ({
  page,
}, info) => {
  await logInAs(page, "owner");
  for (const label of OWNER_ONLY) {
    await openFullMenu(page, info);
    await page.getByRole("link", { name: label, exact: true }).locator("visible=true").click();
    await expect(page).toHaveURL(new RegExp(`/${label.toLowerCase()}$`));
    await expect(
      page.getByRole("link", { name: label, exact: true }).locator("visible=true"),
    ).toHaveCount(isPhone(info) ? 0 : 1); // sheet closes after navigating on phones
  }
});

test("[UI-NAV-ROLE] the owner's whole desktop menu fits a 720px-tall laptop screen", async ({
  page,
}, info) => {
  test.skip(isPhone(info), "desktop sidebar only");
  await logInAs(page, "owner");
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("link", { name: "Users", exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(sidebar.getByRole("button", { name: "Log out" })).toBeInViewport({ ratio: 1 });
});

test("[UI-LABELS] every button and link on every page shows text, for both roles", async ({
  page,
}, info) => {
  for (const [role, pages] of [
    ["owner", OWNER_PAGES],
    ["staff", STAFF_PAGES],
  ] as const) {
    await page.context().clearCookies();
    await logInAs(page, role);
    for (const path of pages) {
      await page.goto(path);
      await expectVisibleTextOnAllControls(page, `${role} ${path}`);
    }
    if (isPhone(info)) {
      await openFullMenu(page, info);
      await expectVisibleTextOnAllControls(page, `${role} More sheet`);
      await page.getByRole("button", { name: "Close" }).click();
    }
  }
  await page.context().clearCookies();
  for (const path of ["/login", "/forbidden"]) {
    await page.goto(path);
    await expectVisibleTextOnAllControls(page, path);
  }
});

test("[UI-THEME] switching to dark changes the colours and survives a reload", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "light" });
  await logInAs(page, "staff");
  const html = page.locator("html");
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await expect(html).toHaveAttribute("data-theme", "light");
  expect(await background()).toBe("rgb(255, 255, 255)");

  await openFullMenu(page, info);
  await page.getByRole("button", { name: "Dark mode" }).locator("visible=true").click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await background()).toBe("rgb(20, 14, 11)");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await background()).toBe("rgb(20, 14, 11)");

  await openFullMenu(page, info);
  await page.getByRole("button", { name: "Light mode" }).locator("visible=true").click();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("[FR-007] opening the app announces products that are low on stock", async ({ page }) => {
  await logInAs(page, "owner");
  expect(lowStock).toBeGreaterThanOrEqual(1);
  const notice = page.getByText(
    lowStock === 1
      ? "1 product is low on stock or out of stock."
      : `${lowStock} products are low on stock or out of stock.`,
  );
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "View" }).click();
  await expect(page).toHaveURL(/\/products\?stock=low$/);
});

test("[FR-007] the Products menu item shows the low-stock count", async ({ page }, info) => {
  await logInAs(page, "staff");
  if (isPhone(info)) {
    await expect(
      page.getByRole("link", { name: /Products/ }).locator("visible=true"),
    ).toContainText(String(lowStock));
  } else {
    await expect(page.getByLabel(`${lowStock} low on stock`).locator("visible=true")).toBeVisible();
  }
});
