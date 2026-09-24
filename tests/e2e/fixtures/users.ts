// Test-only accounts created in the TEST database before every e2e run. Not real credentials.
import { expect, type Page } from "@playwright/test";

export const E2E_PASSWORD = "e2e-Password-1";

export const E2E_USERS = {
  owner: { email: "owner@e2e.test", name: "E2E Owner", role: "OWNER", active: true },
  staff: { email: "staff@e2e.test", name: "E2E Staff", role: "STAFF", active: true },
  inactive: { email: "inactive@e2e.test", name: "E2E Former Staff", role: "STAFF", active: false },
} as const;

/** Fills in and submits the login form. */
export async function logIn(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Logs in from /login and waits until the app has taken the user off the login page. */
export async function logInAs(page: Page, user: keyof typeof E2E_USERS) {
  await page.goto("/login");
  await logIn(page, E2E_USERS[user].email);
  await expect(page).not.toHaveURL(/\/login/);
}
