import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS, logIn, logInAs } from "../fixtures/users";

// Next.js adds its own empty role=alert route announcer, so match the error by its text.
const loginError = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "Wrong email or password" });

test.describe("login", () => {
  test("[FR-030] a wrong password is refused with a message", async ({ page }) => {
    await page.goto("/login");
    await logIn(page, E2E_USERS.staff.email, "not-the-password");
    await expect(loginError(page)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("[FR-030] the right password logs in and lands on the dashboard", async ({ page }) => {
    await page.goto("/login");
    await logIn(page, "  STAFF@e2e.test ");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("[FR-030] a deactivated account cannot log in", async ({ page }) => {
    await page.goto("/login");
    await logIn(page, E2E_USERS.inactive.email);
    await expect(loginError(page)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("[FR-030] login buttons show text, not just an icon", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Log in" })).toHaveText(/Log in/);
  });
});

test.describe("role access", () => {
  const OWNER_ONLY = ["/users", "/reports", "/suppliers", "/categories"];

  test("[FR-033] staff are turned away from every owner-only page", async ({ page }) => {
    await logInAs(page, "staff");
    for (const path of OWNER_ONLY) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/forbidden$/);
      await expect(page.getByRole("heading", { name: /don.t have access/i })).toBeVisible();
    }
  });

  test("[FR-033] staff can open the pages their role allows", async ({ page }) => {
    await logInAs(page, "staff");
    for (const path of ["/dashboard", "/checkout", "/products", "/sales", "/inventory-history"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`${path}$`));
    }
  });

  test("[FR-033] the owner can open owner-only pages", async ({ page }) => {
    await logInAs(page, "owner");
    for (const path of OWNER_ONLY) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`${path}$`));
    }
  });
});

test.describe("signed-out visitors", () => {
  test("[NFR-SEC-1] every app page sends a signed-out visitor to login", async ({ page }) => {
    for (const path of ["/", "/dashboard", "/checkout", "/products", "/users", "/reports"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  test("[NFR-SEC-1] after logging in, the visitor returns to the page they asked for", async ({
    page,
  }) => {
    await page.goto("/products");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fproducts/);
    await logIn(page, E2E_USERS.staff.email);
    await expect(page).toHaveURL(/\/products$/);
  });

  test("[NFR-SEC-1] a login link cannot bounce the user to another website", async ({ page }) => {
    await page.goto("/login?callbackUrl=https://evil.example/steal");
    await logIn(page, E2E_USERS.staff.email);
    await expect(page).toHaveURL(/localhost:3200\/dashboard$/);
  });
});
