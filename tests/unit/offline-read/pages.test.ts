// What each offline-app page shows, per role (FR-049, FR-055, FR-032; leaf 9.2). Staff pages never
// show purchase prices, suppliers, or accounts, even on a device that still holds owner data.
import { afterEach, beforeEach, expect, test } from "vitest";
import { applySnapshot } from "@/lib/offline/catalog";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";
import { containsInsensitive, compareText } from "@/lib/offline/read/compare";
import { offlineViewer } from "@/lib/offline/read/device";
import { readOfflinePage, searchParamsObject, type OfflinePage } from "@/lib/offline/read/pages";
import { matchOfflineRoute, type OfflineRoute } from "@/lib/offline/read/routes";
import { SESSION_CACHE, SESSION_URL, type SavedSession } from "@/lib/offline/read/session";
import type { Snapshot, SnapshotProduct } from "@/lib/offline/snapshot";

const T = "2026-10-03T00:00:00.000Z";
const OWNER: SavedSession = {
  id: "u-owner",
  name: "Ana Owner",
  email: "ana@shop.test",
  role: "OWNER",
};
const STAFF: SavedSession = {
  id: "u-staff",
  name: "Bea Staff",
  email: "bea@shop.test",
  role: "STAFF",
};

function product(overrides: Partial<SnapshotProduct> & Pick<SnapshotProduct, "id" | "name">) {
  return {
    code: overrides.id.toUpperCase(),
    barcode: null,
    brand: null,
    categoryId: "c-bags",
    categoryName: "Bags",
    supplierId: "s-samar",
    purchasePrice: 12_345,
    sellingPrice: 25_000,
    stockQuantity: 10,
    lowStockThreshold: 5,
    expirationDate: null,
    imageUrl: null,
    archivedAt: null,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  } satisfies SnapshotProduct;
}

/** The owner's full snapshot: what a device holds before the owner signs out. */
const OWNER_SNAPSHOT: Snapshot = {
  version: 1,
  full: true,
  cursor: T,
  user: { id: OWNER.id, role: "OWNER" },
  products: [
    product({ id: "p-tote", name: "Banig Tote" }),
    product({ id: "p-fan", name: "Pandan Fan", purchasePrice: null, stockQuantity: 2 }),
    product({ id: "p-old", name: "Old Basket", archivedAt: T, supplierId: null }),
  ],
  categories: [{ id: "c-bags", name: "Bags", createdAt: T, updatedAt: T }],
  categoryIds: ["c-bags"],
  suppliers: [
    {
      id: "s-samar",
      name: "Samar Weavers Coop",
      contactPerson: null,
      phone: "0917 000 0000",
      email: null,
      address: null,
      createdAt: T,
      updatedAt: T,
    },
  ],
  supplierIds: ["s-samar"],
  users: [
    { ...OWNER, active: true, createdAt: T, updatedAt: T, name: "Ana Owner (stored)" },
    { ...STAFF, active: true, createdAt: T, updatedAt: T },
  ],
  userIds: [OWNER.id, STAFF.id],
  sales: [],
  refunds: [],
  inventoryChanges: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      productId: "p-tote",
      productName: "Banig Tote",
      productCode: "P-TOTE",
      type: "RESTOCK",
      quantityChange: 4,
      stockAfter: 10,
      saleId: null,
      refundId: null,
      userId: STAFF.id,
      userName: STAFF.name,
      note: null,
      occurredAt: T,
      recordedAt: T,
    },
  ],
};

const SECRETS = ["12345", "s-samar", "Samar Weavers Coop", "0917 000 0000", OWNER.email];

let db: OfflineDb;
let dbCount = 0;

beforeEach(async () => {
  db = openOfflineDb(`offline-read-${++dbCount}`);
  await applySnapshot(OWNER_SNAPSHOT, new Date(T), db);
});

afterEach(async () => {
  await db.delete();
});

async function open(path: string, viewer: SavedSession): Promise<OfflinePage> {
  const url = new URL(path, "https://shop.test");
  return readOfflinePage(matchOfflineRoute(url.pathname) as OfflineRoute, viewer, url.search, db);
}

/** A Cache Storage holding this session reply, or nothing. */
function cacheWith(body: unknown): CacheStorage {
  return {
    match: async (url: string, options?: MultiCacheQueryOptions) =>
      body !== undefined && url === SESSION_URL && options?.cacheName === SESSION_CACHE
        ? new Response(JSON.stringify(body))
        : undefined,
  } as unknown as CacheStorage;
}

test("[FR-055-ROLE-PAGES] staff product pages never show purchase prices or suppliers, whatever the device holds", async () => {
  const list = await open("/products?cost=missing", STAFF);
  const detail = await open("/products/p-tote", STAFF);
  const edit = await open("/products/p-tote/edit", STAFF);
  const add = await open("/products/new", STAFF);

  if (list.status !== "ok" || list.data.page !== "products" || !list.data.products.ok) {
    throw new Error("products page didn't open");
  }
  // The cost filter is ignored for staff, as online: both products in use are listed.
  expect(list.data.products.data.items.map((p) => p.name)).toEqual(["Banig Tote", "Pandan Fan"]);
  expect(list.data.products.data.items.every((p) => !p.needsCost)).toBe(true);

  expect(detail).toMatchObject({ status: "ok", data: { page: "product" } });
  if (detail.status === "ok" && detail.data.page === "product") {
    expect(detail.data.product.costs).toBeNull();
  }
  expect(edit).toMatchObject({ status: "ok", data: { page: "product-form", suppliers: null } });
  expect(add).toMatchObject({ status: "ok", data: { page: "product-form", suppliers: null } });

  for (const page of [list, detail, edit, add]) {
    const text = JSON.stringify(page);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  }
});

test("[FR-055-ROLE-PAGES] staff can't open owner-only pages offline", async () => {
  for (const path of ["/categories", "/suppliers", "/users", "/account"]) {
    expect(await open(path, STAFF), path).toEqual({ status: "forbidden" });
  }
  // Staff may see inventory history, as online.
  const history = await open("/inventory-history", STAFF);
  expect(history).toMatchObject({ status: "ok", data: { page: "inventory-history" } });
  expect(JSON.stringify(history)).toContain("Bea Staff");
});

test("[FR-055-ROLE-PAGES] the owner's offline pages show costs, suppliers, and accounts", async () => {
  const detail = await open("/products/p-tote", OWNER);
  expect(detail).toMatchObject({
    status: "ok",
    lowStockCount: 1,
    data: {
      page: "product",
      product: {
        name: "Banig Tote",
        costs: { purchasePrice: 12_345, supplierId: "s-samar", supplierName: "Samar Weavers Coop" },
      },
    },
  });
  expect(await open("/products/p-fan/edit", OWNER)).toMatchObject({
    data: { page: "product-form", suppliers: [{ id: "s-samar", name: "Samar Weavers Coop" }] },
  });
  expect(await open("/products?cost=missing", OWNER)).toMatchObject({
    data: {
      products: { ok: true, data: { total: 1, items: [{ name: "Pandan Fan", needsCost: true }] } },
    },
  });
  expect(await open("/suppliers", OWNER)).toMatchObject({
    data: { suppliers: { ok: true, data: [{ name: "Samar Weavers Coop", productCount: 2 }] } },
  });
  expect(await open("/categories", OWNER)).toMatchObject({
    data: { categories: { ok: true, data: [{ name: "Bags", productCount: 3 }] } },
  });
  expect(await open("/users", OWNER)).toMatchObject({
    data: { users: { ok: true, data: [{ id: OWNER.id }, { id: STAFF.id }] } },
  });
  expect(await open("/account", OWNER)).toMatchObject({
    data: { page: "account", user: { name: "Ana Owner (stored)", email: OWNER.email } },
  });
});

test("[FR-049-READ-PARITY] an unknown product is not found, and an archived one can't be edited", async () => {
  expect(await open("/products/p-missing", OWNER)).toEqual({ status: "not-found" });
  expect(await open("/products/p-missing/edit", OWNER)).toEqual({ status: "not-found" });
  expect(await open("/products/p-old/edit", OWNER)).toEqual({
    status: "redirect",
    to: "/products/p-old",
  });
  expect(await open("/products/p-old", STAFF)).toMatchObject({
    status: "ok",
    data: { product: { archived: true, costs: null } },
  });
});

test("[FR-049-READ-PARITY] the offline app draws pages only for the signed-in user whose data the device holds", async () => {
  const session = (user: SavedSession) => ({ user, expires: T });
  expect(await offlineViewer(db, cacheWith(session(OWNER)))).toEqual(OWNER);
  // Signed out (no saved session), or someone else signed in before their data arrived.
  expect(await offlineViewer(db, cacheWith(undefined))).toBeNull();
  expect(await offlineViewer(db, cacheWith({}))).toBeNull();
  expect(await offlineViewer(db, cacheWith(session(STAFF)))).toBeNull();
  // Before the first sync the device holds nobody's data.
  const empty = openOfflineDb(`offline-read-empty-${++dbCount}`);
  expect(await offlineViewer(empty, cacheWith(session(OWNER)))).toBeNull();
  await empty.delete();
});

test("[FR-049-READ-PARITY] search params, text order, and search match the server's rules", () => {
  expect(searchParamsObject("?q=bag&page=2&page=3")).toEqual({ q: "bag", page: ["2", "3"] });
  expect(["apple", "Zebra", "Ápple", "a b", "ab"].sort(compareText)).toEqual([
    "Zebra",
    "a b",
    "ab",
    "apple",
    "Ápple",
  ]);
  expect(["\u{1F600}", "�"].sort(compareText)).toEqual(["�", "\u{1F600}"]);
  const matches = (q: string, text: string) => containsInsensitive(q)(text);
  expect(matches("BANIG", "Banig Tote")).toBe(true);
  expect(matches("b_nig", "Banig")).toBe(true);
  expect(matches("b%e", "Banig Tote")).toBe(true);
  expect(matches("\\_", "Banig")).toBe(false);
  expect(matches("\\_", "Coin_Purse")).toBe(true);
  expect(matches("(a.", "x(a.")).toBe(true);
  expect(matches("(a.", "x(ab")).toBe(false);
});
