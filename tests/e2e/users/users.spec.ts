import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import { logIn, logInAs } from "../fixtures/users";

const FIRST_PASSWORD = "First-Pass-1";
const SECOND_PASSWORD = "Second-Pass-2";

/** Tries to log in from a fresh browser (so the owner's session is untouched). */
async function canLogIn(browser: Browser, info: TestInfo, email: string, password: string) {
  const context = await browser.newContext({
    ...info.project.use,
    baseURL: info.project.use.baseURL ?? "http://localhost:3200",
  });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await logIn(page, email, password);
    const loggedIn = page.waitForURL((url) => !url.pathname.startsWith("/login")).then(() => true);
    const refused = page
      .getByRole("alert")
      .filter({ hasText: "Wrong email or password" })
      .waitFor()
      .then(() => false);
    // The losing wait rejects once the context closes; that's expected, not a failure.
    loggedIn.catch(() => {});
    refused.catch(() => {});
    return await Promise.race([loggedIn, refused]);
  } finally {
    await context.close();
  }
}

test("[FR-045] the owner creates, resets, deactivates, and reactivates a staff account", async ({
  page,
  browser,
}, info) => {
  const name = `New Staff ${info.project.name}`;
  const email = `new-staff-${info.project.name}@e2e.test`;

  await logInAs(page, "owner");
  await page.goto("/users");
  await expect(page.getByRole("heading", { level: 1, name: "User accounts" })).toBeVisible();

  // Create
  const addForm = page.getByRole("region", { name: "Add staff account" });
  await addForm.getByLabel("Name").fill(name);
  await addForm.getByLabel("Email").fill(email);
  await addForm.getByLabel("Password").fill("short");
  await addForm.getByRole("button", { name: "Add staff account" }).click();
  await expect(addForm.getByText("Password must be at least 8 characters.")).toBeVisible();
  await addForm.getByLabel("Password").fill(FIRST_PASSWORD);
  await addForm.getByRole("button", { name: "Add staff account" }).click();
  await expect(page.getByText(`Account created for ${name}.`)).toBeVisible();

  const row = page
    .getByRole("list", { name: "Accounts" })
    .getByRole("listitem")
    .filter({ hasText: email });
  await expect(row).toContainText("Staff");
  await expect(row).toContainText("Active");
  expect(await canLogIn(browser, info, email, FIRST_PASSWORD)).toBe(true);

  // Reset password
  await row.getByRole("button", { name: "Reset password" }).click();
  await row.getByLabel(`New password for ${name}`).fill(SECOND_PASSWORD);
  await row.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText(`New password saved for ${name}.`)).toBeVisible();
  expect(await canLogIn(browser, info, email, FIRST_PASSWORD)).toBe(false);
  expect(await canLogIn(browser, info, email, SECOND_PASSWORD)).toBe(true);

  // Deactivate (asks first)
  await row.getByRole("button", { name: "Deactivate" }).click();
  await row.getByRole("button", { name: "Yes, deactivate" }).click();
  await expect(page.getByText(`${name} can no longer log in.`)).toBeVisible();
  await expect(row).toContainText("Deactivated");
  expect(await canLogIn(browser, info, email, SECOND_PASSWORD)).toBe(false);

  // Reactivate
  await row.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByText(`${name} can log in again.`)).toBeVisible();
  await expect(row).toContainText("Active");
  expect(await canLogIn(browser, info, email, SECOND_PASSWORD)).toBe(true);
});

test("[FR-045] the owner's own account has no reset or deactivate buttons", async ({ page }) => {
  await logInAs(page, "owner");
  await page.goto("/users");
  const ownerRow = page
    .getByRole("list", { name: "Accounts" })
    .getByRole("listitem")
    .filter({ hasText: "owner@e2e.test" });
  await expect(ownerRow).toContainText("Owner");
  await expect(ownerRow.getByRole("button")).toHaveCount(0);
});

test("[USERS-STAFF-DENIED] staff are sent to the no-access page", async ({ page }) => {
  await logInAs(page, "staff");
  await page.goto("/users");
  await expect(page).toHaveURL(/\/forbidden$/);
});
