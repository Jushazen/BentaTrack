import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_USERS, logIn, logInAs } from "../fixtures/users";

// Browsers decide for themselves when to fire `beforeinstallprompt`, so the tests fire a stand-in
// with a recording prompt(). iPhone is emulated by its user agent, and an installed app by
// answering the display-mode media query, which is how the app detects it.

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";

const isPhone = (info: TestInfo) => info.project.name === "phone";

/** On phones "Install app" lives in the "More" sheet; on desktop, in the top bar. */
async function openMenu(page: Page, info: TestInfo) {
  if (isPhone(info)) {
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "More pages" })).toBeVisible();
  } else {
    await expect(page.getByRole("complementary")).toBeVisible();
  }
}

const installButton = (page: Page) =>
  page.getByRole("button", { name: "Install app" }).locator("visible=true");

async function offerInstall(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  await page.evaluate((choice) => {
    const w = window as unknown as { __installPrompts: number };
    w.__installPrompts = 0;
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        w.__installPrompts += 1;
      },
      userChoice: Promise.resolve({ outcome: choice }),
    });
    window.dispatchEvent(event);
  }, outcome);
}

const promptCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __installPrompts: number }).__installPrompts);

async function pretendInstalled(page: Page) {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => real(query.includes("display-mode") ? "all" : query);
    Object.defineProperty(navigator, "standalone", { value: true });
  });
}

test("[FR-061] the Install app button opens the browser's install prompt and then goes away", async ({
  page,
}, info) => {
  // Chrome often offers install on the login page; the offer must survive signing in.
  await page.goto("/login");
  await offerInstall(page);
  await logIn(page, E2E_USERS.staff.email);
  await expect(page).not.toHaveURL(/\/login/);
  await openMenu(page, info);

  await installButton(page).click();
  expect(await promptCount(page)).toBe(1);
  await expect(installButton(page)).toHaveCount(0);
});

test("[FR-061] no Install app button until the browser offers install, nor after it is dismissed", async ({
  page,
}, info) => {
  await logInAs(page, "staff");
  await openMenu(page, info);
  await expect(page.getByRole("button", { name: "Log out" }).locator("visible=true")).toBeVisible();
  await expect(installButton(page)).toHaveCount(0);

  await offerInstall(page, "dismissed");
  await installButton(page).click();
  expect(await promptCount(page)).toBe(1);
  await expect(installButton(page)).toHaveCount(0);
});

test("[FR-061] with Install app showing, the owner's whole desktop menu still fits a 720px-tall screen", async ({
  page,
}, info) => {
  test.skip(isPhone(info), "desktop sidebar only");
  await logInAs(page, "owner");
  await offerInstall(page);
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Install app" }),
  ).toBeInViewport({ ratio: 1 });
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("link", { name: "Users", exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(sidebar.getByRole("button", { name: "Log out" })).toBeInViewport({ ratio: 1 });
});

test("[FR-061] no Install app button once the app runs installed", async ({ page }, info) => {
  await pretendInstalled(page);
  await logInAs(page, "owner");
  await offerInstall(page);
  await openMenu(page, info);
  await expect(page.getByRole("button", { name: "Log out" }).locator("visible=true")).toBeVisible();
  await expect(installButton(page)).toHaveCount(0);
});

test.describe("on iPhone Safari", () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test("[FR-061] Install app shows the Share → Add to Home Screen steps", async ({
    page,
  }, info) => {
    await logInAs(page, "staff");
    await openMenu(page, info);
    await installButton(page).click();

    const steps = page.getByRole("dialog", { name: "Install BentaTrack on this device" });
    await expect(steps).toBeVisible();
    await expect(steps).toContainText("Share");
    await expect(steps).toContainText("Add to Home Screen");
    await expect(steps).not.toContainText("Open this page in Safari");

    await steps.getByRole("button", { name: "Close" }).click();
    await expect(steps).toBeHidden();
  });

  test("[FR-061] no install steps once the app runs from the home screen", async ({
    page,
  }, info) => {
    await pretendInstalled(page);
    await logInAs(page, "staff");
    await openMenu(page, info);
    await expect(
      page.getByRole("button", { name: "Log out" }).locator("visible=true"),
    ).toBeVisible();
    await expect(installButton(page)).toHaveCount(0);
  });
});

test.describe("on iPhone in another browser", () => {
  test.use({ userAgent: IPHONE_CHROME });

  test("[FR-061] the steps start by opening the page in Safari", async ({ page }, info) => {
    await logInAs(page, "staff");
    await openMenu(page, info);
    await installButton(page).click();
    const steps = page.getByRole("dialog", { name: "Install BentaTrack on this device" });
    await expect(steps).toContainText("Open this page in Safari");
    await expect(steps).toContainText("Add to Home Screen");
  });
});
