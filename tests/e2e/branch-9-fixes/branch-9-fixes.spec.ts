// Fixes found while closing branch 9 (leaf 9.7).
// - Online, a device whose session cookie is gone is shown the login page, never the pages of
//   the user who was signed in, even though the device still keeps that user's data for offline.
// - At phone width an in-use category's name and its "can't be deleted" note don't overlap.
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

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

/** A category, with one product in it (so it can't be deleted) when `code` is given. */
function insertCategory(name: string, code?: string) {
  return withTestDb(async (client) => {
    const categoryId = randomUUID();
    await client.query(`insert into "Category" (id, name, "updatedAt") values ($1, $2, now())`, [
      categoryId,
      name,
    ]);
    if (!code) return;
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
       values ($1, $2, $3, $4, 45000, 4, now())`,
      [randomUUID(), `${name} item`, code, categoryId],
    );
  });
}

/** Waits until the background work after signing in is done: worker, saved session, device data. */
async function waitUntilSettled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          caches
            .match("/api/auth/session", { cacheName: "session", ignoreVary: true })
            .then(Boolean),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.waitForLoadState("networkidle");
  // The worker's own requests don't show as page traffic, and a session reply re-issues the
  // cookie. Leave the app so nothing new starts, and let anything in flight land.
  await page.goto("about:blank");
  await page.waitForTimeout(2_000);
}

test("[SESSION-CLEARED-ONLINE] online, a device whose session cookie is gone shows the login page, not the previous user's pages", async ({
  page,
  context,
}) => {
  await logInAs(page, "staff");
  await expect(page).toHaveURL(/\/dashboard$/);
  await waitUntilSettled(page);

  await context.clearCookies();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in to BentaTrack", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();

  // Pages the staff member could open send the device to the login page too.
  for (const path of ["/dashboard", "/products", "/sales"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
    await expect(page.getByLabel("Email"), path).toBeVisible();
  }

  // And the owner can sign in on it.
  await logInAs(page, "owner");
  await expect(page).toHaveURL(/\/dashboard$/);
});

/** True when two boxes share any area. */
function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found, String(locator)).not.toBeNull();
  return found!;
}

/** Where an element's text is actually drawn, which can spill past the element's own box. */
async function textBox(locator: Locator) {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { x, y, width, height };
  });
}

test.describe("category row at phone width", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("[CATEGORY-ROW-PHONE] a category's name has the row to itself, never under its buttons or its can't-be-deleted note", async ({
    page,
  }, info) => {
    const suffix = `${info.project.name}-${randomUUID().slice(0, 4)}`;
    const rows = [
      { name: `Hats ${suffix}`, used: true },
      { name: `Handwoven Abaca and Pandan Accessories ${suffix}`, used: true },
      { name: `Empty Shelf ${suffix}`, used: false },
      { name: `Perfumery ${suffix}`, used: false },
    ];
    for (const [i, { name, used }] of rows.entries()) {
      await insertCategory(name, used ? `E2E-CROW-${i}-${suffix}` : undefined);
    }

    await logInAs(page, "owner");
    await page.goto("/categories");
    const list = page.getByRole("list", { name: "Categories" });
    for (const { name, used } of rows) {
      const row = list.getByRole("listitem").filter({ hasText: name });
      const label = row.getByText(name, { exact: true });
      const note = row.getByText("In use, so it can't be deleted");
      await expect(label).toBeVisible();
      await expect(note).toHaveCount(used ? 1 : 0);
      const controls: [string, Locator][] = [
        ["Rename", row.getByRole("button", { name: "Rename" })],
        used ? ["note", note] : ["Delete", row.getByRole("button", { name: "Delete" })],
      ];
      const rowBox = await box(row);
      const nameBox = await textBox(label);
      for (const [what, control] of controls) {
        const controlBox = what === "note" ? await textBox(control) : await box(control);
        expect(overlaps(nameBox, controlBox), `${name}: name and ${what} overlap`).toBe(false);
        // On a phone the name has the row to itself; buttons and note go below it.
        expect(controlBox.y, `${name}: ${what} is below the name`).toBeGreaterThanOrEqual(
          nameBox.y + nameBox.height,
        );
      }
      // The name is drawn whole, inside the row.
      expect(nameBox.x, `${name}: name starts inside the row`).toBeGreaterThanOrEqual(rowBox.x - 1);
      expect(nameBox.x + nameBox.width, `${name}: name ends inside the row`).toBeLessThanOrEqual(
        rowBox.x + rowBox.width + 1,
      );
    }
    await page.screenshot({ path: info.outputPath("categories-phone.png"), fullPage: true });
  });
});
