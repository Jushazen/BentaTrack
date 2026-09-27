// Offline product catalog (§4.9, FR-026–028 without a connection). Leaf 6.1.
// Refreshed from /api/catalog while online; searched on the device when the server can't be
// reached. Matching and ranking mirror searchProducts()/lookupProduct() in
// src/features/search/queries.ts so results look the same online and offline.
// Browser only.
import type { CatalogEntry, SearchHit } from "@/features/search/queries";
import { stockStatus } from "@/lib/stock-status";
import { offlineDb, type CatalogProduct, type OfflineDb } from "./db";

// Same limits as the server search (SEARCH_LIMIT, MAX_QUERY_LENGTH). Not imported from there,
// because that module is server-only.
const SEARCH_LIMIT = 20;
const MAX_QUERY_LENGTH = 100;
const SYNCED_AT_KEY = "catalogSyncedAt";

function normalize(raw: string): string {
  return raw.trim().slice(0, MAX_QUERY_LENGTH);
}

export function toCatalogProduct(entry: CatalogEntry): CatalogProduct {
  return {
    ...entry,
    nameLower: entry.name.toLowerCase(),
    codeLower: entry.code.toLowerCase(),
    barcodeLower: entry.barcode ? entry.barcode.toLowerCase() : null,
  };
}

function toHit(product: CatalogProduct): SearchHit {
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    barcode: product.barcode,
    brand: product.brand,
    categoryName: product.categoryName,
    sellingPrice: product.sellingPrice,
    stockQuantity: product.stockQuantity,
    status: stockStatus(product.stockQuantity, product.lowStockThreshold),
    imageUrl: product.imageUrl,
  };
}

/** Replaces the whole catalog with a fresh snapshot, all or nothing. */
export async function replaceCatalog(
  entries: CatalogEntry[],
  syncedAt: Date = new Date(),
  db: OfflineDb = offlineDb(),
): Promise<void> {
  await db.transaction("rw", db.products, db.meta, async () => {
    await db.products.clear();
    await db.products.bulkPut(entries.map(toCatalogProduct));
    await db.meta.put({ key: SYNCED_AT_KEY, value: syncedAt.toISOString() });
  });
}

/** When the catalog was last refreshed from the server, or null if it never was. */
export async function catalogSyncedAt(db: OfflineDb = offlineDb()): Promise<Date | null> {
  const entry = await db.meta.get(SYNCED_AT_KEY);
  return entry ? new Date(entry.value) : null;
}

function rank(product: CatalogProduct, q: string): number {
  if (product.barcodeLower === q || product.codeLower === q) return 0;
  if (product.codeLower.startsWith(q)) return 1;
  if (product.nameLower.startsWith(q)) return 2;
  return 3;
}

/**
 * Products whose name or code contains the query, or whose barcode equals it, best matches
 * first: exact barcode or code, then code prefix, then name prefix, then the rest by name.
 */
export async function searchCatalog(
  rawQuery: string,
  db: OfflineDb = offlineDb(),
): Promise<SearchHit[]> {
  const q = normalize(rawQuery).toLowerCase();
  if (!q) return [];
  const matches = await db.products
    .filter((p) => p.nameLower.includes(q) || p.codeLower.includes(q) || p.barcodeLower === q)
    .toArray();
  return matches
    .map((product) => ({ product, rank: rank(product, q) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.product.name.localeCompare(b.product.name) ||
        a.product.code.localeCompare(b.product.code),
    )
    .slice(0, SEARCH_LIMIT)
    .map(({ product }) => toHit(product));
}

/** The product with this barcode, else the one with this product code (FR-028). */
export async function lookupCatalog(
  rawCode: string,
  db: OfflineDb = offlineDb(),
): Promise<SearchHit | null> {
  const code = normalize(rawCode).toLowerCase();
  if (!code) return null;
  const product =
    (await db.products.where("barcodeLower").equals(code).first()) ??
    (await db.products.where("codeLower").equals(code).first());
  return product ? toHit(product) : null;
}

/**
 * Downloads the current catalog and stores it on the device. Returns false when the server
 * can't be reached or refuses (e.g. signed out); the previous copy is then kept.
 */
export async function refreshCatalog(db: OfflineDb = offlineDb()): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch("/api/catalog", { cache: "no-store", credentials: "same-origin" });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const body = (await response.json()) as { products: CatalogEntry[] };
  await replaceCatalog(body.products, new Date(), db);
  return true;
}
