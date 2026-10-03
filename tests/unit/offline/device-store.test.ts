// The device's copy of everything its user may see (FR-055, leaf 9.1): storing full and partial
// snapshots, removing owner data, and asking the browser to keep it.
import { render } from "@testing-library/react";
import Dexie from "dexie";
import { createElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OfflineCatalogSync } from "@/components/offline/offline-catalog-sync";
import {
  applySnapshot,
  deviceDataOwner,
  lookupCatalog,
  purgeOwnerData,
  requestPersistentStorage,
  searchCatalog,
  syncDeviceData,
} from "@/lib/offline/catalog";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";
import type {
  Snapshot,
  SnapshotProduct,
  SnapshotSale,
  SnapshotSupplier,
  SnapshotUser,
} from "@/lib/offline/snapshot";

vi.mock("@serwist/turbopack/react", () => ({ useSerwist: () => ({ serwist: null }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

let db: OfflineDb;
let dbCount = 0;

const T = "2026-10-03T00:00:00.000Z";
const OWNER = { id: "u-owner", role: "OWNER" } as const;
const STAFF = { id: "u-staff", role: "STAFF" } as const;

function product(
  overrides: Partial<SnapshotProduct> & Pick<SnapshotProduct, "id" | "name" | "code">,
) {
  return {
    barcode: null,
    brand: null,
    categoryId: "c-bags",
    categoryName: "Bags",
    supplierId: null,
    purchasePrice: null,
    sellingPrice: 50_000,
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

const supplier: SnapshotSupplier = {
  id: "s-1",
  name: "Samar Weavers Coop",
  contactPerson: null,
  phone: "0917 000 0000",
  email: null,
  address: null,
  createdAt: T,
  updatedAt: T,
};

const users: SnapshotUser[] = [
  { ...OWNER, email: "owner@shop.ph", name: "Owner", active: true, createdAt: T, updatedAt: T },
  { ...STAFF, email: "staff@shop.ph", name: "Staff", active: true, createdAt: T, updatedAt: T },
];

function sale(unitCost: number | null): SnapshotSale {
  return {
    id: "sale-1",
    occurredAt: T,
    recordedAt: T,
    staffId: STAFF.id,
    staffName: "Staff",
    customerInfo: null,
    subtotal: 100_000,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    total: 100_000,
    paymentMethod: "CASH",
    items: [
      {
        id: "line-1",
        productId: "p-tote",
        productName: "Banig Tote",
        productCode: "TOTE-1",
        quantity: 2,
        unitPrice: 50_000,
        unitCost,
        refundedQuantity: 0,
      },
    ],
  };
}

/** A full owner snapshot of a small shop. */
function ownerSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    full: true,
    cursor: T,
    user: OWNER,
    products: [
      product({
        id: "p-tote",
        name: "Banig Tote",
        code: "TOTE-1",
        barcode: "4801",
        supplierId: "s-1",
        purchasePrice: 30_000,
      }),
      product({ id: "p-old", name: "Old Basket", code: "OLD-1", archivedAt: T }),
    ],
    categories: [{ id: "c-bags", name: "Bags", createdAt: T, updatedAt: T }],
    categoryIds: ["c-bags"],
    suppliers: [supplier],
    supplierIds: ["s-1"],
    users,
    userIds: users.map((u) => u.id),
    sales: [sale(30_000)],
    refunds: [],
    inventoryChanges: [
      {
        id: "ic-1",
        productId: "p-tote",
        productName: "Banig Tote",
        productCode: "TOTE-1",
        type: "SALE",
        quantityChange: -2,
        stockAfter: 10,
        saleId: "sale-1",
        refundId: null,
        userId: STAFF.id,
        userName: "Staff",
        note: null,
        occurredAt: T,
        recordedAt: T,
      },
    ],
    ...overrides,
  };
}

/** A staff snapshot of the same shop, as the server scopes it. */
function staffSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const owner = ownerSnapshot();
  return {
    ...owner,
    user: STAFF,
    products: owner.products.map((p) => ({ ...p, purchasePrice: null, supplierId: null })),
    suppliers: [],
    supplierIds: [],
    users: [],
    userIds: [],
    sales: [sale(null)],
    ...overrides,
  };
}

async function queueOfflineSale() {
  await db.outbox.add({
    id: "queued-1",
    kind: "SALE",
    payload: { id: "queued-1" },
    createdAt: 1,
    attempts: 0,
    lastError: null,
  });
}

/** Every owner-only value still on the device, wherever it is kept. */
async function ownerDataLeft(): Promise<unknown[]> {
  const products = await db.products.toArray();
  const sales = await db.sales.toArray();
  return [
    ...(await db.suppliers.toArray()),
    ...(await db.users.toArray()),
    ...products.filter((p) => p.purchasePrice !== null || p.supplierId !== null),
    ...sales.flatMap((s) => s.items).filter((item) => item.unitCost !== null),
  ];
}

beforeEach(() => {
  db = openOfflineDb(`bentatrack-device-test-${++dbCount}`);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});

test("[FR-055] a full snapshot stores every table, and archived products stay stored but are never found", async () => {
  await applySnapshot(ownerSnapshot(), new Date(T), db);

  expect(await db.products.count()).toBe(2);
  expect(await db.categories.count()).toBe(1);
  expect(await db.suppliers.count()).toBe(1);
  expect(await db.users.count()).toBe(2);
  expect(await db.sales.count()).toBe(1);
  expect(await db.inventoryChanges.count()).toBe(1);
  expect(await deviceDataOwner(db)).toEqual(OWNER);

  expect((await lookupCatalog("4801", db))?.id).toBe("p-tote");
  expect(await lookupCatalog("OLD-1", db)).toBeNull();
  expect(await searchCatalog("basket", db)).toEqual([]);
  expect((await searchCatalog("tote", db)).map((h) => h.id)).toEqual(["p-tote"]);
});

test("[FR-055] a partial snapshot updates changed rows, drops deleted categories and suppliers, and relabels products", async () => {
  await applySnapshot(
    ownerSnapshot({
      categories: [
        { id: "c-bags", name: "Bags", createdAt: T, updatedAt: T },
        { id: "c-gone", name: "Gone", createdAt: T, updatedAt: T },
      ],
      categoryIds: ["c-bags", "c-gone"],
    }),
    new Date(T),
    db,
  );

  await applySnapshot(
    ownerSnapshot({
      full: false,
      cursor: "2026-10-03T01:00:00.000Z",
      products: [product({ id: "p-new", name: "Capiz Earrings", code: "EAR-1" })],
      categories: [{ id: "c-bags", name: "Handbags", createdAt: T, updatedAt: T }],
      categoryIds: ["c-bags"],
      suppliers: [],
      supplierIds: [],
      users: [],
      sales: [],
      inventoryChanges: [],
    }),
    new Date(T),
    db,
  );

  // Untouched rows stay; the new product is added.
  expect((await db.products.toCollection().primaryKeys()).sort()).toEqual([
    "p-new",
    "p-old",
    "p-tote",
  ]);
  expect(await db.sales.count()).toBe(1);
  expect(await db.users.count()).toBe(2);
  expect(await db.categories.toCollection().primaryKeys()).toEqual(["c-bags"]);
  expect(await db.suppliers.count()).toBe(0);
  expect((await lookupCatalog("TOTE-1", db))?.categoryName).toBe("Handbags");
  expect((await db.meta.get("snapshotCursor"))?.value).toBe("2026-10-03T01:00:00.000Z");
});

test("[FR-055-SIGNOUT-PURGE] the owner signing out removes owner-only data and keeps queued changes and what staff may see", async () => {
  await applySnapshot(ownerSnapshot(), new Date(T), db);
  await queueOfflineSale();
  expect(await ownerDataLeft()).not.toEqual([]); // control: there was owner data to remove

  await purgeOwnerData(db);

  expect(await ownerDataLeft()).toEqual([]);
  expect(await db.outbox.count()).toBe(1);
  expect(await db.products.count()).toBe(2);
  expect(await db.sales.count()).toBe(1);
  expect(await db.inventoryChanges.count()).toBe(1);
  expect((await lookupCatalog("TOTE-1", db))?.name).toBe("Banig Tote");
  // The device no longer holds the owner's copy, so the next sync downloads everything.
  expect(await deviceDataOwner(db)).toBeNull();
  expect(await db.meta.get("snapshotCursor")).toBeUndefined();
});

test("[FR-055-SIGNOUT-PURGE] a different user signing in replaces the previous user's data; queued changes stay", async () => {
  await applySnapshot(ownerSnapshot(), new Date(T), db);
  await queueOfflineSale();

  await applySnapshot(
    staffSnapshot({ products: [product({ id: "p-only", name: "Staff View", code: "SV-1" })] }),
    new Date(T),
    db,
  );

  expect(await ownerDataLeft()).toEqual([]);
  expect(await db.products.toCollection().primaryKeys()).toEqual(["p-only"]);
  expect(await db.outbox.count()).toBe(1);
  expect(await deviceDataOwner(db)).toEqual(STAFF);

  // Even a partial staff snapshot never leaves owner data behind.
  await applySnapshot(ownerSnapshot(), new Date(T), db);
  await applySnapshot(staffSnapshot({ full: false, products: [], sales: [] }), new Date(T), db);
  expect(await db.suppliers.count()).toBe(0);
  expect(await db.users.count()).toBe(0);
});

test("[FR-055-INCREMENTAL] the device asks for changes since its cursor, and keeps its copy on a bad reply", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(staffSnapshot()));
  vi.stubGlobal("fetch", fetchMock);

  expect(await syncDeviceData(db)).toBe(true);
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/catalog",
    expect.objectContaining({ cache: "no-store" }),
  );

  fetchMock.mockResolvedValue(
    Response.json(staffSnapshot({ full: false, cursor: "2026-10-04T00:00:00.000Z" })),
  );
  expect(await syncDeviceData(db)).toBe(true);
  const url = new URL(fetchMock.mock.lastCall![0] as string, "http://device");
  expect(url.pathname).toBe("/api/catalog");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    since: T,
    user: STAFF.id,
    role: "STAFF",
  });

  // Unreachable, refused, or not a snapshot: nothing changes.
  for (const reply of [
    () => Promise.reject(new TypeError("Failed to fetch")),
    () => Promise.resolve(new Response("{}", { status: 401 })),
    () => Promise.resolve(Response.json({ products: [] })),
    () => Promise.resolve(new Response("<html>", { status: 200 })),
  ]) {
    fetchMock.mockImplementationOnce(reply);
    expect(await syncDeviceData(db)).toBe(false);
  }
  expect(await db.products.count()).toBe(2);
  expect((await db.meta.get("snapshotCursor"))?.value).toBe("2026-10-04T00:00:00.000Z");
});

test("[OFFLINE-PERSIST] the device asks the browser to keep its data, once, and copes when it can't", async () => {
  const persist = vi.fn().mockResolvedValue(true);
  const persisted = vi.fn().mockResolvedValue(false);
  expect(await requestPersistentStorage({ persist, persisted })).toBe("persisted");
  expect(persist).toHaveBeenCalledOnce();

  // Already kept: no second request.
  const again = vi.fn();
  expect(
    await requestPersistentStorage({ persist: again, persisted: vi.fn().mockResolvedValue(true) }),
  ).toBe("persisted");
  expect(again).not.toHaveBeenCalled();

  expect(
    await requestPersistentStorage({
      persist: vi.fn().mockResolvedValue(false),
      persisted: vi.fn().mockResolvedValue(false),
    }),
  ).toBe("denied");
  expect(await requestPersistentStorage(undefined)).toBe("unsupported");
  expect(
    await requestPersistentStorage({
      persist: vi.fn().mockRejectedValue(new Error("SecurityError")),
      persisted: vi.fn().mockResolvedValue(false),
    }),
  ).toBe("unsupported");
});

test("[OFFLINE-PERSIST] the app asks for persistent storage when a signed-in page opens", async () => {
  const persist = vi.fn().mockResolvedValue(true);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { persist, persisted: vi.fn().mockResolvedValue(false) },
  });
  try {
    const view = render(createElement(OfflineCatalogSync));
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
    view.unmount();
  } finally {
    Reflect.deleteProperty(navigator, "storage");
    vi.restoreAllMocks();
  }
});

test("[OFFLINE-DB] a device with leaf 6.1's catalog upgrades in place: products stay searchable and queued changes stay", async () => {
  const name = `bentatrack-upgrade-test-${++dbCount}`;
  const v1 = new Dexie(name);
  v1.version(1).stores({
    products: "id, codeLower, barcodeLower",
    meta: "key",
    outbox: "id, createdAt",
  });
  await v1.table("products").put({
    id: "p-1",
    name: "Banig Tote",
    code: "TOTE-1",
    barcode: null,
    brand: null,
    categoryName: "Bags",
    sellingPrice: 50_000,
    stockQuantity: 4,
    lowStockThreshold: 5,
    imageUrl: null,
    nameLower: "banig tote",
    codeLower: "tote-1",
    barcodeLower: null,
  });
  await v1
    .table("outbox")
    .put({ id: "q-1", kind: "SALE", payload: {}, createdAt: 1, attempts: 0, lastError: null });
  v1.close();

  const upgraded = openOfflineDb(name);
  try {
    expect((await lookupCatalog("tote-1", upgraded))?.status).toBe("LOW_STOCK");
    expect(await upgraded.products.get("p-1")).toMatchObject({
      archivedAt: null,
      purchasePrice: null,
      categoryId: "",
    });
    expect(await upgraded.outbox.count()).toBe(1);
    expect(await upgraded.sales.count()).toBe(0);
    // No snapshot cursor yet, so the next sync is a full one.
    expect(await deviceDataOwner(upgraded)).toBeNull();
  } finally {
    await upgraded.delete();
  }
});
