// The device's copy of everything its user may see (FR-055, leaf 9.1), in a real browser: what
// an owner's and a staff member's device hold after one online sign-in, what the owner signing
// out leaves behind, and how fast the first snapshot of a boutique-sized shop arrives.
import { randomUUID } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import dotenv from "dotenv";
import pg from "pg";
import { removeDemo, seedDemo } from "../../../prisma/seed-demo";
import { E2E_USERS, logInAs } from "../fixtures/users";

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

/** One stored record from the device's database (IndexedDB "bentatrack"). */
type Row = Record<string, unknown>;

/** Every record in one table of the device's database; empty if it doesn't exist yet. */
async function deviceRows(page: Page, store: string): Promise<Row[]> {
  return page.evaluate(
    (name) =>
      new Promise<Row[]>((resolve) => {
        const open = indexedDB.open("bentatrack");
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(name)) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction(name).objectStore(name).getAll();
          all.onsuccess = () => {
            resolve(all.result as Row[]);
            db.close();
          };
          all.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
    store,
  );
}

/** Whose data the device holds, from its meta table. */
async function deviceOwner(page: Page): Promise<string | null> {
  const meta = await deviceRows(page, "meta");
  const role = meta.find((m) => m.key === "snapshotRole")?.value;
  const cursor = meta.find((m) => m.key === "snapshotCursor")?.value;
  return typeof role === "string" && typeof cursor === "string" ? role : null;
}

/**
 * Puts a supplier, a product bought from it at a known cost, and a staff sale of that product
 * straight into the TEST database.
 */
async function seedCostedSale(suffix: string) {
  return withTestDb(async (client) => {
    const supplierId = randomUUID();
    const productId = randomUUID();
    const saleId = randomUUID();
    const supplierName = `E2E Supplier ${suffix}`;
    const code = `E2E-SNAP-${suffix}`;
    await client.query(
      `insert into "Supplier" (id, name, phone, "updatedAt") values ($1, $2, '0917 555 0101', now())`,
      [supplierId, supplierName],
    );
    await client.query(
      `insert into "Product" (id, name, code, "categoryId", "supplierId", "purchasePrice", "sellingPrice", "stockQuantity", "updatedAt")
       select $1, $2, $3, id, $4, 12345, 50000, 7, now() from "Category" where name = 'E2E Category'`,
      [productId, `Snapshot Tote ${suffix}`, code, supplierId],
    );
    const {
      rows: [staff],
    } = await client.query<{ id: string }>(`select id from "User" where email = $1`, [
      E2E_USERS.staff.email,
    ]);
    await client.query(
      `insert into "Sale" (id, "occurredAt", "staffId", subtotal, total, "paymentMethod")
       values ($1, now(), $2, 50000, 50000, 'CASH')`,
      [saleId, staff!.id],
    );
    await client.query(
      `insert into "SaleItem" (id, "saleId", "productId", "productName", "productCode", quantity, "unitPrice", "unitCost")
       values ($1, $2, $3, $4, $5, 1, 50000, 12345)`,
      [randomUUID(), saleId, productId, `Snapshot Tote ${suffix}`, code],
    );
    await client.query(
      `insert into "InventoryChange" (id, "productId", "productName", "productCode", type, "quantityChange", "stockAfter", "saleId", "userId", "occurredAt")
       values ($1, $2, $3, $4, 'SALE', -1, 7, $5, $6, now())`,
      [randomUUID(), productId, `Snapshot Tote ${suffix}`, code, saleId, staff!.id],
    );
    return { supplierId, supplierName, productId, saleId, code };
  });
}

type SaleRow = { id: string; items: { unitCost: number | null }[] };

/** Everything owner-only on the device: suppliers, accounts, costs, supplier links. */
async function ownerDataOnDevice(page: Page): Promise<unknown[]> {
  const products = await deviceRows(page, "products");
  const sales = (await deviceRows(page, "sales")) as unknown as SaleRow[];
  return [
    ...(await deviceRows(page, "suppliers")),
    ...(await deviceRows(page, "users")),
    ...products.filter((p) => p.purchasePrice !== null || p.supplierId !== null),
    ...sales.flatMap((s) => s.items).filter((item) => item.unitCost !== null),
  ];
}

async function logOut(page: Page, info: TestInfo) {
  if (info.project.name === "phone") {
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "More pages" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Log out" }).locator("visible=true").click();
  await expect(page).toHaveURL(/\/login/);
}

test("[FR-055] [OFFLINE-SNAPSHOT] after one online sign-in the device holds the owner's or the staff member's data, and owner data leaves on sign-out", async ({
  page,
}, info) => {
  const suffix = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const seeded = await seedCostedSale(suffix);

  // The owner's device: products with costs and suppliers, suppliers, accounts, sales with costs.
  await logInAs(page, "owner");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect.poll(() => deviceOwner(page), { timeout: 30_000 }).toBe("OWNER");
  const ownerProduct = (await deviceRows(page, "products")).find((p) => p.code === seeded.code);
  expect(ownerProduct).toMatchObject({ purchasePrice: 12345, supplierId: seeded.supplierId });
  expect((await deviceRows(page, "suppliers")).map((s) => s.name)).toContain(seeded.supplierName);
  expect((await deviceRows(page, "users")).map((u) => u.email)).toEqual(
    expect.arrayContaining(Object.values(E2E_USERS).map((u) => u.email)),
  );
  for (const user of await deviceRows(page, "users"))
    expect(user).not.toHaveProperty("passwordHash");
  const ownerSale = ((await deviceRows(page, "sales")) as unknown as SaleRow[]).find(
    (s) => s.id === seeded.saleId,
  );
  expect(ownerSale?.items[0]?.unitCost).toBe(12345);
  expect((await deviceRows(page, "categories")).map((c) => c.name)).toContain("E2E Category");
  expect((await deviceRows(page, "inventoryChanges")).some((c) => c.saleId === seeded.saleId)).toBe(
    true,
  );

  // Signing out takes the owner's data off the device; what anyone may see stays.
  await logOut(page, info);
  expect(await ownerDataOnDevice(page)).toEqual([]);
  expect((await deviceRows(page, "products")).map((p) => p.code)).toContain(seeded.code);

  // The staff member's device: the same products and sales, without any owner-only data.
  await logInAs(page, "staff");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect.poll(() => deviceOwner(page), { timeout: 30_000 }).toBe("STAFF");
  const staffProduct = (await deviceRows(page, "products")).find((p) => p.code === seeded.code);
  expect(staffProduct).toMatchObject({ purchasePrice: null, supplierId: null, stockQuantity: 7 });
  expect(
    ((await deviceRows(page, "sales")) as unknown as SaleRow[]).some((s) => s.id === seeded.saleId),
  ).toBe(true);
  expect((await deviceRows(page, "inventoryChanges")).some((c) => c.saleId === seeded.saleId)).toBe(
    true,
  );
  expect(await ownerDataOnDevice(page)).toEqual([]);
});

// Same throttling as the page-load test (tests/perf): Chrome DevTools' "Fast 4G" with the phone's
// CPU slowed 4x. DevTools throttling only reaches requests the page makes itself, so the service
// worker is kept out of the way.
const FAST_4G = {
  offline: false,
  latency: 150 * 1.1,
  downloadThroughput: (9 * 1024 * 0.9 * 1024) / 8,
  uploadThroughput: (1.5 * 1024 * 0.9 * 1024) / 8,
};
const CPU_SLOWDOWN = 4;
const BUDGET_MS = 10_000;
const DEMO_PRODUCTS = 5_000;

test.describe("first snapshot speed", () => {
  test.use({ serviceWorkers: "block" });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    await withTestDb((client) => seedDemo(client, { products: DEMO_PRODUCTS, days: 90 }));
  });

  // Other test files share this database; their lists must not fill up with demo data.
  test.afterAll(async () => {
    await withTestDb(removeDemo);
  });

  test("[OFFLINE-SNAPSHOT-PERF] the first snapshot of the demo shop downloads and is stored within 10 seconds on a throttled phone", async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", FAST_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

    // The owner gets the largest snapshot: everything, with costs, suppliers, and accounts.
    let startedAt = 0;
    page.on("request", (request) => {
      if (!startedAt && new URL(request.url()).pathname === "/api/catalog") startedAt = Date.now();
    });
    const reply = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/catalog", {
      timeout: 120_000,
    });
    await logInAs(page, "owner");

    let storedAt = 0;
    await expect
      .poll(
        async () => {
          const owner = await deviceOwner(page);
          const count = owner
            ? await page.evaluate(
                () =>
                  new Promise<number>((resolve) => {
                    const open = indexedDB.open("bentatrack");
                    open.onerror = () => resolve(0);
                    open.onsuccess = () => {
                      const req = open.result
                        .transaction("products")
                        .objectStore("products")
                        .count();
                      req.onsuccess = () => {
                        resolve(req.result);
                        open.result.close();
                      };
                      req.onerror = () => resolve(0);
                    };
                  }),
              )
            : 0;
          if (count >= DEMO_PRODUCTS && !storedAt) storedAt = Date.now();
          return count >= DEMO_PRODUCTS;
        },
        { timeout: 120_000, intervals: [100] },
      )
      .toBe(true);

    const response = await reply;
    expect(response.status()).toBe(200);
    expect(response.request().url()).not.toContain("since=");
    const sizes = await response.request().sizes();
    const elapsed = storedAt - startedAt;
    info.annotations.push({
      type: "snapshot",
      description: `${elapsed} ms, ${Math.round(sizes.responseBodySize / 1024)} KB transferred`,
    });
    console.log(
      `[OFFLINE-SNAPSHOT-PERF] ${info.project.name}: ${elapsed} ms, ${Math.round(sizes.responseBodySize / 1024)} KB transferred`,
    );
    expect(startedAt).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(BUDGET_MS);

    const sales = await deviceRows(page, "sales");
    expect(sales.length).toBeGreaterThan(500);
  });
});
