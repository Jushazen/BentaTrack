// Account changes and what they do to sessions (FR-045, FR-060, FR-036; leaf 9.5).
// - Account and password changes need a connection: offline, the pages open but their changes are
//   refused with a message, and nothing is queued.
// - A staff device that was offline while the account was deactivated is signed out as soon as it
//   reconnects. Its sale stays on the device; the owner then signs in there and sends it, and it is
//   saved under the staff member's name.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pg from "pg";
import { logIn, logInAs } from "../fixtures/users";

const FIRST_PASSWORD = "First-Pass-1";
const NEW_PASSWORD = "Offline-Pass-2";

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

/** An account of this test's own, so changing it can't disturb the shared e2e accounts. */
async function insertAccount(role: "OWNER" | "STAFF", email: string, name: string) {
  const passwordHash = await bcrypt.hash(FIRST_PASSWORD, 10);
  await withTestDb((client) =>
    client.query(
      `insert into "User" (id, email, name, "passwordHash", role, active, "updatedAt")
       values ($1, $2, $3, $4, $5, true, now())`,
      [randomUUID(), email, name, passwordHash, role],
    ),
  );
}

function insertProduct(name: string, code: string) {
  return withTestDb(async (client) => {
    const id = randomUUID();
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, id, 45000, 6, now() from "Category" where name = 'E2E Category'`,
      [id, name, code],
    );
    return id;
  });
}

function salesOf(productId: string) {
  return withTestDb(async (client) => {
    const { rows } = await client.query<{ staffEmail: string; quantity: number }>(
      `select u.email as "staffEmail", i.quantity
         from "SaleItem" i join "Sale" s on s.id = i."saleId" join "User" u on u.id = s."staffId"
        where i."productId" = $1`,
      [productId],
    );
    return rows;
  });
}

/** A record in the device store (IndexedDB "bentatrack"), or null. */
async function deviceRecord(page: Page, store: string, key: string): Promise<unknown> {
  return page.evaluate(
    ([storeName, id]) =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open("bentatrack");
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction(storeName).objectStore(storeName).get(id);
          get.onsuccess = () => {
            resolve(get.result ?? null);
            db.close();
          };
          get.onerror = () => resolve(null);
        };
      }),
    [store, key] as const,
  );
}

/** Everything in the device's outbox, as text. */
async function outboxText(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open("bentatrack");
        open.onerror = () => resolve("");
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction("outbox").objectStore("outbox").getAll();
          all.onsuccess = () => {
            resolve(JSON.stringify(all.result));
            db.close();
          };
          all.onerror = () => resolve("");
        };
      }),
  );
}

/** Positive control: with the network cut, a request that is never cached must fail. */
async function expectNetworkCut(page: Page) {
  const outcome = await page.evaluate(() =>
    fetch("/api/sync", { cache: "no-store" }).then(
      (response) => `status ${response.status}`,
      () => "failed",
    ),
  );
  expect(outcome).toBe("failed");
}

// Each test waits for the worker to install, goes offline and back, and hashes passwords at
// full bcrypt cost in the browser: give it three times the usual time.
test.slow();

const syncStatus = (page: Page) => page.getByTestId("sync-status");
const signedOutNotice = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });

test("[ACCOUNT-ONLINE-ONLY] offline, the owner's account pages open but their changes say a connection is needed, and nothing is queued", async ({
  page,
  context,
}) => {
  await logInAs(page, "owner");
  await page.goto("/users");
  await expect(page.getByRole("heading", { level: 1, name: "User accounts" })).toBeVisible();
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
  await expect(syncStatus(page)).toHaveText(/^Online$/);

  await context.setOffline(true);
  await expectNetworkCut(page);
  await expect(syncStatus(page)).toHaveText(/^Offline$/);

  const form = page.getByRole("region", { name: "Change password" });
  await form.getByLabel("Current password").fill(FIRST_PASSWORD);
  await form.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await form.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText("Changing your password needs an internet connection. Connect and try again."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/account$/);

  // The accounts page opens offline from the device; adding staff is refused the same way.
  await page.goto("/users");
  await expect(page.getByRole("heading", { level: 1, name: "User accounts" })).toBeVisible();
  const add = page.getByRole("region", { name: "Add staff account" });
  await add.getByLabel("Name").fill("Offline Staff");
  await add.getByLabel("Email").fill("offline-staff@e2e.test");
  await add.getByLabel("Password").fill(NEW_PASSWORD);
  await add.getByRole("button", { name: "Add staff account" }).click();
  await expect(
    page.getByText("Account changes need an internet connection. Connect and try again."),
  ).toBeVisible();

  // Nothing waits to sync, and no password is kept on the device.
  await expect(syncStatus(page)).toHaveText(/^Offline$/);
  const queued = await outboxText(page);
  expect(queued).not.toContain(NEW_PASSWORD);
  expect(queued).not.toContain(FIRST_PASSWORD);
  await context.setOffline(false);
  expect(
    await withTestDb(async (client) => {
      const { rowCount } = await client.query(`select 1 from "User" where email = $1`, [
        "offline-staff@e2e.test",
      ]);
      return rowCount;
    }),
  ).toBe(0);
});

test("[FR-045-RECONNECT] [FR-036-DEACTIVATED-SEND] a staff device offline during the deactivation is signed out on reconnect, and the owner sends its sale from that device", async ({
  page,
  context,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const email = `offline-staff-${suffix}@e2e.test`;
  const staffName = `Lena ${suffix}`;
  await insertAccount("STAFF", email, staffName);
  const productName = `Banig Clutch ${suffix}`;
  const productId = await insertProduct(productName, `E2E-ACC-${suffix}`);

  await page.goto("/login");
  await logIn(page, email, FIRST_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  // Ready to work offline: the worker controls the page, saved checkout and who is signed in,
  // and the device holds the product.
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const checkout = await caches.match("/checkout", { ignoreVary: true });
          const session = await caches.match("/api/auth/session", { cacheName: "session" });
          return Boolean(checkout && session);
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect
    .poll(() => deviceRecord(page, "products", productId), { timeout: 30_000 })
    .not.toBeNull();

  await context.setOffline(true);
  await expectNetworkCut(page);
  await page.goto("/checkout");
  await page.getByRole("combobox", { name: "Add a product" }).fill(productName);
  await page.getByRole("option").filter({ hasText: productName }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/Sale saved on this device/)).toBeVisible();
  await expect(syncStatus(page)).toContainText("1 waiting");

  // Meanwhile, the owner deactivates the account from another device.
  await withTestDb((client) =>
    client.query(`update "User" set active = false, "deactivatedAt" = now() where email = $1`, [
      email,
    ]),
  );

  // Reconnecting signs this device out, with the reason; the sale was not saved, nor lost.
  await context.setOffline(false);
  await expect(page).toHaveURL(/\/login\?signedOut=deactivated$/, { timeout: 30_000 });
  await expect(signedOutNotice(page, "Your account was turned off")).toBeVisible();
  expect(await salesOf(productId)).toEqual([]);
  expect(await outboxText(page)).toContain("Sale of ₱450.00 (1 item)");

  // The owner signs in on the same device and sends it.
  await logInAs(page, "owner");
  await syncStatus(page).click();
  const panel = page.getByRole("dialog", { name: "Sync" });
  const group = panel.getByRole("region", { name: `Changes by ${staffName}` });
  await expect(group).toContainText(`1 change by ${staffName}, account deactivated`, {
    timeout: 30_000,
  });
  await expect(group.getByRole("listitem")).toContainText("Sale of ₱450.00 (1 item)");
  await group.getByRole("button", { name: `Send ${staffName}'s changes` }).click();
  await expect(page.getByText("Sync complete: 1 change saved to the server.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(group).toHaveCount(0);

  // Saved under the staff member's name, not the owner's.
  expect(await salesOf(productId)).toEqual([{ staffEmail: email, quantity: 1 }]);
});
