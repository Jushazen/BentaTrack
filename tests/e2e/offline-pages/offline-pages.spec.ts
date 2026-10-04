// Every page opens offline after one online sign-in (FR-049, FR-055, leaf 9.2): the menu pages,
// and a product's page and edit form that were never opened on this device, with their data,
// for the owner and for staff. Staff never see purchase prices or suppliers offline.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { E2E_USERS, logInAs } from "../fixtures/users";

type Shop = {
  productId: string;
  name: string;
  code: string;
  supplier: string;
};

/** Puts a supplier, a product with a cost from it, and one history row into the TEST database. */
async function seedShop(suffix: string): Promise<Shop> {
  dotenv.config({ quiet: true });
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  const shop = {
    productId: `e2e-offline-${suffix}`,
    name: `Offline Capiz Lamp ${suffix}`,
    code: `E2E-OFFPG-${suffix}`,
    supplier: `Offline Supplier ${suffix}`,
  };
  try {
    const supplierId = randomUUID();
    await client.query(
      `insert into "Supplier" (id, name, phone, "updatedAt") values ($1, $2, '0917 555 0101', now())`,
      [supplierId, shop.supplier],
    );
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "supplierId", "purchasePrice", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, id, $4, 43210, 98750, 6, now() from "Category" where name = 'E2E Category'`,
      [shop.productId, shop.name, shop.code, supplierId],
    );
    await client.query(
      `insert into "InventoryChange" (id, "productId", "productName", "productCode", type, "quantityChange", "stockAfter", "userId", note, "occurredAt")
       select $1, $2, $3, $4, 'RESTOCK', 6, 6, id, 'First delivery', now() from "User" where email = $5`,
      [randomUUID(), shop.productId, shop.name, shop.code, E2E_USERS.owner.email],
    );
  } finally {
    await client.end();
  }
  return shop;
}

/** Product codes in the device store (IndexedDB "bentatrack"). */
async function deviceProductCodes(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open("bentatrack");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("products")) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction("products").objectStore("products").getAll();
          all.onsuccess = () => {
            resolve((all.result as { code: string }[]).map((p) => p.code));
            db.close();
          };
          all.onerror = () => resolve([]);
        };
      }),
  );
}

/** Waits until the device is ready to work offline: worker, device data, session, saved pages. */
async function waitUntilOfflineReady(page: Page, code: string, pages: string[]) {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect.poll(() => deviceProductCodes(page), { timeout: 30_000 }).toContain(code);
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          Boolean(await caches.match("/api/auth/session", { cacheName: "session" })),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  for (const path of pages) {
    await expect
      .poll(
        () => page.evaluate((url) => caches.match(url, { ignoreVary: true }).then(Boolean), path),
        {
          timeout: 30_000,
        },
      )
      .toBe(true);
  }
}

/** Positive control: with the network cut, a request that is never cached must fail. */
async function expectNetworkCut(page: Page) {
  const outcome = await page.evaluate(() =>
    fetch("/api/catalog", { cache: "no-store" }).then(
      (response) => `status ${response.status}`,
      () => "failed",
    ),
  );
  expect(outcome).toBe("failed");
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, level: 1 });

async function expectNotOfflineNotice(page: Page) {
  await expect(page.getByRole("heading", { name: "You are offline" })).toHaveCount(0);
}

test("[FR-049-PAGES] the owner opens every page offline with its data, including a product never opened", async ({
  page,
  context,
}, info) => {
  const shop = await seedShop(`${info.project.name}-o-${randomUUID().slice(0, 6)}`);
  await logInAs(page, "owner");
  await expect(page).toHaveURL(/\/dashboard/);
  await waitUntilOfflineReady(page, shop.code, ["/checkout"]);

  await context.setOffline(true);
  await expectNetworkCut(page);

  // The one page kept as a saved copy.
  await page.goto("/checkout");
  await expect(heading(page, "Checkout")).toBeVisible();

  // Dashboard, sales, and reports are drawn from the device store (leaf 9.3).
  for (const [path, title] of [
    ["/dashboard", "Dashboard"],
    ["/sales", "Sales"],
    ["/reports", "Sales reports"],
  ] as const) {
    await page.goto(path);
    await expect(heading(page, title), path).toBeVisible();
    await expectNotOfflineNotice(page);
  }

  // Pages drawn from the device store, with their data.
  await page.goto(`/products?q=${encodeURIComponent(shop.code)}`);
  await expect(heading(page, "Products")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(shop.name) })).toBeVisible();
  await expect(page).toHaveTitle("Products · BentaTrack");

  await page.goto("/categories");
  await expect(heading(page, "Categories")).toBeVisible();
  await expect(page.getByText("E2E Category").first()).toBeVisible();

  await page.goto("/suppliers");
  await expect(heading(page, "Suppliers")).toBeVisible();
  await expect(page.getByText(shop.supplier)).toBeVisible();

  await page.goto("/users");
  await expect(heading(page, "User accounts")).toBeVisible();
  await expect(page.getByText(E2E_USERS.staff.email)).toBeVisible();

  await page.goto("/account");
  await expect(heading(page, "My account")).toBeVisible();
  await expect(page.getByText(`(${E2E_USERS.owner.email})`)).toBeVisible();

  await page.goto(`/inventory-history?product=${shop.productId}`);
  await expect(heading(page, "Inventory history")).toBeVisible();
  await expect(page.getByText("First delivery")).toBeVisible();

  // A product page never opened on this device, reached by an in-app link while offline.
  await page.goto(`/products?q=${encodeURIComponent(shop.code)}`);
  await page.getByRole("link", { name: new RegExp(shop.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${shop.productId}$`));
  await expect(heading(page, shop.name)).toBeVisible();
  await expect(page.getByText("₱987.50")).toBeVisible();
  await expect(page.getByText("₱432.10")).toBeVisible();
  await expect(page.getByText(shop.supplier)).toBeVisible();
  await expectNotOfflineNotice(page);

  // Its edit form, opened by address, filled in from the device store.
  await page.goto(`/products/${shop.productId}/edit`);
  await expect(heading(page, `Edit ${shop.name}`)).toBeVisible();
  await expect(page.getByLabel("Product name")).toHaveValue(shop.name);
  await expect(page.getByLabel("Product code")).toHaveValue(shop.code);
  await expect(page.getByLabel("Purchase price (₱)")).toHaveValue("432.10");
  await expect(page.getByLabel("Supplier")).toBeVisible();

  // It survives a reload with no connection.
  await page.reload();
  await expect(heading(page, `Edit ${shop.name}`)).toBeVisible();

  await context.setOffline(false);
});

test("[FR-055-ROLE-PAGES] [FR-049-PAGES] staff open their pages offline without costs or suppliers, and owner pages stay closed", async ({
  page,
  context,
}, info) => {
  const shop = await seedShop(`${info.project.name}-s-${randomUUID().slice(0, 6)}`);
  await logInAs(page, "staff");
  await expect(page).toHaveURL(/\/dashboard/);
  await waitUntilOfflineReady(page, shop.code, ["/checkout"]);

  await context.setOffline(true);
  await expectNetworkCut(page);

  for (const [path, title] of [
    ["/dashboard", "Dashboard"],
    ["/checkout", "Checkout"],
    ["/sales", "Sales"],
  ] as const) {
    await page.goto(path);
    await expect(heading(page, title), path).toBeVisible();
    await expectNotOfflineNotice(page);
  }

  await page.goto(`/products?q=${encodeURIComponent(shop.code)}`);
  await expect(heading(page, "Products")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(shop.name) })).toBeVisible();

  await page.goto(`/inventory-history?product=${shop.productId}`);
  await expect(heading(page, "Inventory history")).toBeVisible();
  await expect(page.getByText("First delivery")).toBeVisible();

  await page.goto(`/products/${shop.productId}`);
  await expect(heading(page, shop.name)).toBeVisible();
  await expect(page.getByText("₱987.50")).toBeVisible();
  await expect(page.getByText("Purchase price")).toHaveCount(0);
  await expect(page.getByText("₱432.10")).toHaveCount(0);
  await expect(page.getByText(shop.supplier)).toHaveCount(0);

  await page.goto(`/products/${shop.productId}/edit`);
  await expect(heading(page, `Edit ${shop.name}`)).toBeVisible();
  await expect(page.getByLabel("Product name")).toHaveValue(shop.name);
  await expect(page.getByLabel("Purchase price (₱)")).toHaveCount(0);
  await expect(page.getByLabel("Supplier")).toHaveCount(0);

  const body = await page.content();
  expect(body).not.toContain(shop.supplier);
  expect(body).not.toContain("432.10");

  for (const path of ["/suppliers", "/users", "/categories", "/account", "/reports"]) {
    await page.goto(path);
    // Reports too: the offline app draws it, so staff get the same no-access page as online.
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
      path,
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sales reports" })).toHaveCount(0);
    await expect(page.getByText(shop.supplier)).toHaveCount(0);
  }

  await context.setOffline(false);
});
