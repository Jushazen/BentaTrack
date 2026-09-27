import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CatalogEntry } from "@/features/search/queries";
import {
  catalogSyncedAt,
  lookupCatalog,
  refreshCatalog,
  replaceCatalog,
  searchCatalog,
} from "@/lib/offline/catalog";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";

let db: OfflineDb;
let dbCount = 0;

function entry(overrides: Partial<CatalogEntry> & Pick<CatalogEntry, "id" | "name" | "code">) {
  return {
    barcode: null,
    brand: null,
    categoryName: "Bags",
    sellingPrice: 10_000,
    stockQuantity: 10,
    lowStockThreshold: 5,
    imageUrl: null,
    ...overrides,
  } satisfies CatalogEntry;
}

beforeEach(() => {
  db = openOfflineDb(`bentatrack-test-${++dbCount}`);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});

test("[OFFLINE-DB] a snapshot is stored with its sync time, and computes stock status on the device", async () => {
  expect(await catalogSyncedAt(db)).toBeNull();
  const syncedAt = new Date("2026-09-27T01:00:00Z");
  await replaceCatalog(
    [
      entry({ id: "a", name: "Canvas Tote", code: "TOTE-1", stockQuantity: 10 }),
      entry({ id: "b", name: "Pandan Fan", code: "FAN-1", stockQuantity: 3 }),
      entry({ id: "c", name: "Rattan Bag", code: "BAG-1", stockQuantity: 0 }),
    ],
    syncedAt,
    db,
  );

  expect(await db.products.count()).toBe(3);
  expect(await catalogSyncedAt(db)).toEqual(syncedAt);
  expect((await lookupCatalog("TOTE-1", db))?.status).toBe("ACTIVE");
  expect((await lookupCatalog("FAN-1", db))?.status).toBe("LOW_STOCK");
  expect((await lookupCatalog("BAG-1", db))?.status).toBe("OUT_OF_STOCK");
});

test("[OFFLINE-DB] a new snapshot replaces the old one, so deleted products disappear", async () => {
  await replaceCatalog(
    [
      entry({ id: "a", name: "Canvas Tote", code: "TOTE-1" }),
      entry({ id: "b", name: "Pandan Fan", code: "FAN-1" }),
    ],
    new Date(),
    db,
  );
  await replaceCatalog(
    [entry({ id: "a", name: "Canvas Tote XL", code: "TOTE-1" })],
    new Date(),
    db,
  );

  expect(await db.products.count()).toBe(1);
  expect(await lookupCatalog("FAN-1", db)).toBeNull();
  expect((await lookupCatalog("TOTE-1", db))?.name).toBe("Canvas Tote XL");
});

test("[OFFLINE-DB] a snapshot that fails part-way leaves the previous catalog untouched", async () => {
  const before = new Date("2026-09-26T00:00:00Z");
  await replaceCatalog([entry({ id: "a", name: "Canvas Tote", code: "TOTE-1" })], before, db);
  const broken = [
    entry({ id: "b", name: "Pandan Fan", code: "FAN-1" }),
    { ...entry({ id: "x", name: "No id", code: "X-1" }), id: undefined as unknown as string },
  ];

  await expect(replaceCatalog(broken, new Date(), db)).rejects.toThrow();

  expect(await db.products.count()).toBe(1);
  expect((await lookupCatalog("TOTE-1", db))?.name).toBe("Canvas Tote");
  expect(await catalogSyncedAt(db)).toEqual(before);
});

test("[OFFLINE-DB] the outbox table keeps entries by client id and returns them oldest first", async () => {
  await db.outbox.bulkAdd([
    { id: "u2", kind: "REFUND", payload: {}, createdAt: 2, attempts: 0, lastError: null },
    { id: "u1", kind: "SALE", payload: {}, createdAt: 1, attempts: 0, lastError: null },
  ]);
  await expect(
    db.outbox.add({
      id: "u1",
      kind: "SALE",
      payload: {},
      createdAt: 3,
      attempts: 0,
      lastError: null,
    }),
  ).rejects.toThrow();
  expect((await db.outbox.orderBy("createdAt").toArray()).map((e) => e.id)).toEqual(["u1", "u2"]);
});

test("[OFFLINE-DB] refreshCatalog stores the server snapshot and keeps the old copy when the server can't answer", async () => {
  await replaceCatalog([entry({ id: "a", name: "Canvas Tote", code: "TOTE-1" })], new Date(), db);

  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  expect(await refreshCatalog(db)).toBe(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
  expect(await refreshCatalog(db)).toBe(false);
  expect(await db.products.count()).toBe(1);

  const fresh = { products: [entry({ id: "b", name: "Pandan Fan", code: "FAN-1" })] };
  const fetchMock = vi.fn().mockResolvedValue(Response.json(fresh));
  vi.stubGlobal("fetch", fetchMock);
  expect(await refreshCatalog(db)).toBe(true);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/catalog",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect((await db.products.toArray()).map((p) => p.id)).toEqual(["b"]);
});

test("[OFFLINE-SEARCH] results rank exact code or barcode, then code prefix, then name prefix, then the rest by name", async () => {
  await replaceCatalog(
    [
      // Each better tier sorts later by name, so ranking (not name order) must put it first.
      entry({ id: "rest-z", name: "Rattan scarf", code: "SC-2" }),
      entry({ id: "rest-a", name: "Abaca scarf", code: "SC-1" }),
      entry({ id: "name", name: "Scarf, silk", code: "Z-9" }),
      entry({ id: "code", name: "Yarn clutch", code: "SCARF-77" }),
      entry({ id: "exact", name: "Zipper tote", code: "T-1", barcode: "SCARF" }),
      entry({ id: "other", name: "Pandan fan", code: "FAN-1" }),
    ],
    new Date(),
    db,
  );

  const hits = await searchCatalog("  sCaRf ", db);
  expect(hits.map((h) => h.id)).toEqual(["exact", "code", "name", "rest-a", "rest-z"]);
  expect(hits[0]).not.toHaveProperty("lowStockThreshold");
  expect(hits[0]).not.toHaveProperty("nameLower");
});

test("[OFFLINE-SEARCH] barcodes match only in full, text matches literally, and results are capped at 20", async () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    entry({ id: `p${i}`, name: `Tote ${String(i).padStart(2, "0")}`, code: `T-${i}` }),
  );
  await replaceCatalog(
    [
      ...many,
      entry({ id: "bc", name: "Hat", code: "H-1", barcode: "4801234567890" }),
      entry({ id: "pct", name: "50% off bin", code: "SALE-1" }),
    ],
    new Date(),
    db,
  );

  expect(await searchCatalog("48012", db)).toEqual([]);
  expect((await searchCatalog("4801234567890", db)).map((h) => h.id)).toEqual(["bc"]);
  expect((await searchCatalog("50%", db)).map((h) => h.id)).toEqual(["pct"]);
  expect(await searchCatalog("   ", db)).toEqual([]);
  const totes = await searchCatalog("tote", db);
  expect(totes).toHaveLength(20);
  expect(totes[0]?.name).toBe("Tote 00");
});

test("[OFFLINE-SEARCH] exact lookup prefers the barcode over another product's code, ignoring case", async () => {
  await replaceCatalog(
    [
      entry({ id: "by-code", name: "Canvas Tote", code: "abc-1" }),
      entry({ id: "by-barcode", name: "Pandan Fan", code: "FAN-1", barcode: "ABC-1" }),
    ],
    new Date(),
    db,
  );

  expect((await lookupCatalog("Abc-1", db))?.id).toBe("by-barcode");
  expect((await lookupCatalog("fan-1", db))?.id).toBe("by-barcode");
  expect(await lookupCatalog("nothing", db)).toBeNull();
  expect(await lookupCatalog("", db)).toBeNull();
});
