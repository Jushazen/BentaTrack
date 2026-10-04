// Product and category changes offline (FR-034, FR-053, leaf 9.4). With no connection the owner
// adds a category and a product with a photo, edits one product, and archives another; each shows
// on the device at once and survives a reload. On reconnect they sync by themselves, and one whose
// code was taken on the server meanwhile is shown as refused, with the reason, and discarded.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { logInAs } from "../fixtures/users";

/** A 1×1 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

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

/** Puts a product straight into the TEST database (in the "E2E Category" from global setup). */
function insertProduct(name: string, code: string) {
  return withTestDb(async (client) => {
    const id = randomUUID();
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "purchasePrice", "sellingPrice", "stockQuantity", "lowStockThreshold", "updatedAt")
       select $1, $2, $3, id, 20000, 45000, 8, 2, now() from "Category" where name = 'E2E Category'`,
      [id, name, code],
    );
    return id;
  });
}

type ServerProduct = {
  id: string;
  name: string;
  sellingPrice: number;
  stockQuantity: number;
  imageUrl: string | null;
  archived: boolean;
  categoryName: string;
};

function serverProduct(where: { id?: string; code?: string }) {
  return withTestDb(async (client) => {
    const { rows } = await client.query<ServerProduct>(
      `select p.id, p.name, p."sellingPrice", p."stockQuantity", p."imageUrl",
              p."archivedAt" is not null as archived, c.name as "categoryName"
       from "Product" p join "Category" c on c.id = p."categoryId"
       where ${where.id ? "p.id = $1" : "p.code = $1"}`,
      [where.id ?? where.code],
    );
    return rows;
  });
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

/** Waits until the device can work offline: worker, saved session, device data. */
async function waitUntilOfflineReady(page: Page, code: string) {
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect.poll(() => deviceProductCodes(page), { timeout: 30_000 }).toContain(code);
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
const syncStatus = (page: Page) => page.getByTestId("sync-status");
const QUEUED = "It's saved on this device and will sync when you're back online.";

async function addProduct(
  page: Page,
  product: { name: string; code: string; category: string; price: string; stock: string },
  photo?: Buffer,
) {
  await page.goto("/products/new");
  await expect(heading(page, "Add product")).toBeVisible();
  await page.getByLabel("Product name").fill(product.name);
  await page.getByLabel("Product code").fill(product.code);
  await page.getByLabel("Category", { exact: true }).selectOption({ label: product.category });
  await page.getByLabel("Selling price (₱)").fill(product.price);
  await page.getByLabel("Stock quantity").fill(product.stock);
  if (photo) {
    await page.getByLabel("Photo").setInputFiles({
      name: "tote.png",
      mimeType: "image/png",
      buffer: photo,
    });
    await expect(page.getByAltText("Photo preview")).toBeVisible();
  }
  await page.getByRole("button", { name: "Add product" }).click();
  // Offline the product's page is a fresh page load from the device, which is the confirmation.
  await expect(heading(page, product.name)).toBeVisible();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);
}

test("[FR-034-CATALOG] [FR-053-CATALOG] [PRODUCT-IMAGE-OFFLINE] offline, the owner adds a category and a product with a photo, edits and archives products, and all of it syncs on reconnect; a duplicate code is refused and discarded", async ({
  page,
  context,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const editedCode = `E2E-OEDIT-${suffix}`;
  const archivedCode = `E2E-OARCH-${suffix}`;
  const duplicateCode = `E2E-ODUP-${suffix}`;
  const editedId = await insertProduct(`Offline Edit Fan ${suffix}`, editedCode);
  const archivedId = await insertProduct(`Offline Archive Mat ${suffix}`, archivedCode);

  await logInAs(page, "owner");
  await expect(page).toHaveURL(/\/dashboard/);
  await waitUntilOfflineReady(page, archivedCode);

  await context.setOffline(true);
  await expectNetworkCut(page);
  // Meanwhile another device takes a code this one doesn't know about.
  await insertProduct(`Server Duplicate ${suffix}`, duplicateCode);

  // A category, straight away in the list.
  const category = `Offline Woven ${suffix}`;
  await page.goto("/categories");
  await expect(heading(page, "Categories")).toBeVisible();
  await page.getByLabel("Category name").fill(category);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText(`Category “${category}” added. ${QUEUED}`)).toBeVisible();
  await expect(page.getByRole("list", { name: "Categories" })).toContainText(category);

  // A product in it, with a photo that waits on the device.
  const name = `Offline Abaca Tote ${suffix}`;
  const code = `E2E-ONEW-${suffix}`;
  await addProduct(page, { name, code, category, price: "1,250", stock: "6" }, PNG);
  const newId = new URL(page.url()).pathname.split("/").pop()!;
  const photo = page.getByAltText(`Photo of ${name}`);
  await expect(photo).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.reload();
  await expect(heading(page, name)).toBeVisible();
  await expect(page.getByRole("main")).toContainText(category);
  await expect(photo).toHaveAttribute("src", /^data:image\/png;base64,/);

  // One whose code the server has already given away.
  await addProduct(page, {
    name: `Offline Duplicate ${suffix}`,
    code: duplicateCode,
    category,
    price: "300",
    stock: "1",
  });

  // An edit with a price change and a stock correction.
  await page.goto(`/products/${editedId}/edit`);
  await expect(heading(page, `Edit Offline Edit Fan ${suffix}`)).toBeVisible();
  await page.getByLabel("Selling price (₱)").fill("520");
  await page.getByLabel("Stock quantity").fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${editedId}$`));
  await expect(page.getByRole("main")).toContainText("₱520.00");

  // An archive.
  await page.goto(`/products/${archivedId}`);
  await page.getByRole("button", { name: "Archive product" }).click();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await expect(page.getByText(`Offline Archive Mat ${suffix} archived. ${QUEUED}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore product" })).toBeVisible();

  await expect(syncStatus(page)).toContainText("5 waiting");
  expect(await serverProduct({ id: newId })).toEqual([]);
  expect((await serverProduct({ id: editedId }))[0]).toMatchObject({ sellingPrice: 45_000 });

  // Back online: everything syncs by itself, in order; the duplicate is refused and kept.
  await context.setOffline(false);
  await expect(page.getByText("Sync complete: 4 changes saved to the server.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("1 change couldn't sync. Open “Sync” to see why.")).toBeVisible();

  const [created] = await serverProduct({ id: newId });
  expect(created).toMatchObject({
    name,
    categoryName: category,
    sellingPrice: 125_000,
    stockQuantity: 6,
    archived: false,
  });
  expect(created.imageUrl).toMatch(/\.png$/);
  expect((await serverProduct({ id: editedId }))[0]).toMatchObject({
    sellingPrice: 52_000,
    stockQuantity: 5,
  });
  expect((await serverProduct({ id: archivedId }))[0]).toMatchObject({ archived: true });
  expect(await serverProduct({ code: duplicateCode })).toHaveLength(1);

  // The photo now comes from the server.
  await page.goto(`/products/${newId}`);
  await expect(page.getByAltText(`Photo of ${name}`)).toHaveAttribute("src", created.imageUrl!);

  // The refused change waits with its reason until it is discarded.
  await syncStatus(page).click();
  const dialog = page.getByRole("dialog", { name: "Sync" });
  const refused = dialog.getByRole("listitem", { name: `Add product Offline Duplicate ${suffix}` });
  await expect(refused).toContainText(`Couldn't sync: Code ${duplicateCode} is already used by`);
  await refused.getByRole("button", { name: "Discard" }).click();
  await refused.getByRole("button", { name: "Yes, discard" }).click();
  await expect(page.getByText("Discarded. It won't be sent to the server.")).toBeVisible();
  await expect(dialog).toContainText("Everything is synced.");
  await expect(syncStatus(page)).toHaveText(/^Online$/);
});
