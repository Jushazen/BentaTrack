import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pg from "pg";
import { logIn, logInAs } from "../fixtures/users";

const FIRST_PASSWORD = "First-Pass-1";
const NEW_PASSWORD = "Second-Pass-2";

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
 * Adds an account of its own to the TEST database, so changing its password or deactivating it
 * can't disturb the shared e2e accounts other tests log in with.
 */
async function insertAccount(role: "OWNER" | "STAFF", email: string): Promise<void> {
  const passwordHash = await bcrypt.hash(FIRST_PASSWORD, 10);
  await withTestDb((client) =>
    client.query(
      `insert into "User" (id, email, name, "passwordHash", role, active, "updatedAt")
       values ($1, $2, $3, $4, $5, true, now())
       on conflict (email) do update set "passwordHash" = excluded."passwordHash", active = true`,
      [randomUUID(), email, role === "OWNER" ? "Second Owner" : "Temp Staff", passwordHash, role],
    ),
  );
}

async function logInWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await logIn(page, email, password);
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function newDevice(browser: Browser, info: TestInfo) {
  return browser.newContext({
    ...info.project.use,
    baseURL: info.project.use.baseURL ?? "http://localhost:3200",
  });
}

/** On phones the full menu lives in the "More" sheet; on desktop it's the sidebar. */
async function openFullMenu(page: Page, info: TestInfo) {
  if (info.project.name === "phone") {
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "More pages" })).toBeVisible();
  }
}

const signedOutNotice = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });

test("[FR-060] the owner changes their password and every device, this one included, is logged out", async ({
  page,
  browser,
}, info) => {
  const email = `owner-password-${info.project.name}@e2e.test`;
  await insertAccount("OWNER", email);

  const other = await newDevice(browser, info);
  const otherPage = await other.newPage();
  try {
    await logInWith(otherPage, email, FIRST_PASSWORD);
    await logInWith(page, email, FIRST_PASSWORD);
    await openFullMenu(page, info);
    await page.getByRole("link", { name: "My account" }).locator("visible=true").click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
    const form = page.getByRole("region", { name: "Change password" });

    // A wrong current password is refused and nothing changes.
    await form.getByLabel("Current password").fill("not-my-password");
    await form.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await form.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByText("That isn't your current password.")).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);

    // The right one changes it and logs this device out.
    await form.getByLabel("Current password").fill(FIRST_PASSWORD);
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(page).toHaveURL(/\/login\?signedOut=password$/);
    await expect(signedOutNotice(page, "Your password was changed")).toBeVisible();

    // The other device is logged out on its next page load, without a redirect loop.
    await otherPage.goto("/dashboard");
    await expect(otherPage).toHaveURL(/\/login\?signedOut=password$/);
    await expect(signedOutNotice(otherPage, "Your password was changed")).toBeVisible();

    // The old password no longer works; the new one does.
    await logIn(page, email, FIRST_PASSWORD);
    await expect(
      page.getByRole("alert").filter({ hasText: "Wrong email or password" }),
    ).toBeVisible();
    await logInWith(page, email, NEW_PASSWORD);
  } finally {
    await other.close();
  }
});

test("[FR-060-STAFF-DENIED] staff have no My account page", async ({ page }, info) => {
  await logInAs(page, "staff");
  await openFullMenu(page, info);
  await expect(
    page.getByRole("link", { name: "Products" }).locator("visible=true").first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "My account" })).toHaveCount(0);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/forbidden$/);
});

test("[SESSION-ENDED] a staff member deactivated while logged in lands on the login page with the reason", async ({
  page,
}, info) => {
  const email = `deactivated-${info.project.name}@e2e.test`;
  await insertAccount("STAFF", email);
  await logInWith(page, email, FIRST_PASSWORD);

  await withTestDb((client) =>
    client.query(`update "User" set active = false where email = $1`, [email]),
  );

  await page.goto("/products");
  await expect(page).toHaveURL(/\/login\?signedOut=deactivated$/);
  await expect(signedOutNotice(page, "Your account was turned off")).toBeVisible();
  // The session cookie is gone, so the app pages stay closed.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
