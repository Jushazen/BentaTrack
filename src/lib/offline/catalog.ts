// The device's copy of everything its user may see (FR-055, FR-049, FR-050). Leaf 9.1; the
// product-only catalog of leaf 6.1 grew into it.
// - syncDeviceData() (alias refreshCatalog) downloads the role-scoped snapshot from /api/catalog:
//   everything on a user's first sync, only changes afterwards.
// - purgeOwnerData() removes what staff may not see; called when the owner signs out.
// - searchCatalog()/lookupCatalog() search the stored products when the server can't be reached.
//   Matching and ranking mirror searchProducts()/lookupProduct() in
//   src/features/search/queries.ts so results look the same online and offline. Archived
//   products are kept on the device but never found (FR-057).
// Browser only.
import type { CatalogEntry, SearchHit } from "@/features/search/queries";
import type { Role } from "@/generated/prisma/client";
import { stockStatus } from "@/lib/stock-status";
import { offlineDb, PRODUCT_DEFAULTS, type CatalogProduct, type OfflineDb } from "./db";
import { reapplyOutbox } from "./outbox";
import { SNAPSHOT_VERSION, type Snapshot, type SnapshotProduct } from "./snapshot";

// Same limits as the server search (SEARCH_LIMIT, MAX_QUERY_LENGTH). Not imported from there,
// because that module is server-only.
const SEARCH_LIMIT = 20;
const MAX_QUERY_LENGTH = 100;

export const META = {
  syncedAt: "catalogSyncedAt",
  cursor: "snapshotCursor",
  userId: "snapshotUserId",
  role: "snapshotRole",
} as const;

function normalize(raw: string): string {
  return raw.trim().slice(0, MAX_QUERY_LENGTH);
}

/** A product as the device stores it. Accepts a leaf 6.1 catalog entry too (tests, old callers). */
export function toCatalogProduct(entry: CatalogEntry | SnapshotProduct): CatalogProduct {
  return {
    ...PRODUCT_DEFAULTS,
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

const inUse = (product: CatalogProduct) => !product.archivedAt;

/** Replaces the stored products with these, all or nothing. */
export async function replaceCatalog(
  entries: (CatalogEntry | SnapshotProduct)[],
  syncedAt: Date = new Date(),
  db: OfflineDb = offlineDb(),
): Promise<void> {
  await db.transaction("rw", db.products, db.meta, async () => {
    await db.products.clear();
    await db.products.bulkPut(entries.map(toCatalogProduct));
    await db.meta.put({ key: META.syncedAt, value: syncedAt.toISOString() });
  });
}

/** When the device data was last refreshed from the server, or null if it never was. */
export async function catalogSyncedAt(db: OfflineDb = offlineDb()): Promise<Date | null> {
  const entry = await db.meta.get(META.syncedAt);
  return entry ? new Date(entry.value) : null;
}

/** Whose data the device holds, or null before the first sync or after the owner signed out. */
export async function deviceDataOwner(
  db: OfflineDb = offlineDb(),
): Promise<{ id: string; role: Role } | null> {
  const [userId, role] = await Promise.all([db.meta.get(META.userId), db.meta.get(META.role)]);
  if (!userId || (role?.value !== "OWNER" && role?.value !== "STAFF")) return null;
  return { id: userId.value, role: role.value };
}

function snapshotTables(db: OfflineDb) {
  return [
    db.products,
    db.categories,
    db.suppliers,
    db.users,
    db.sales,
    db.refunds,
    db.inventoryChanges,
    db.meta,
  ];
}

/**
 * Stores a snapshot, all or nothing. A full one replaces every stored record (the outbox is
 * never touched); a partial one adds or updates the changed rows and drops categories,
 * suppliers, and users that no longer exist. Changes still waiting in the outbox are then
 * applied again where the snapshot overwrote them, so the device keeps showing them (leaf 9.4).
 */
export async function applySnapshot(
  snapshot: Snapshot,
  syncedAt: Date = new Date(),
  db: OfflineDb = offlineDb(),
): Promise<void> {
  await db.transaction("rw", [...snapshotTables(db), db.outbox], async () => {
    if (snapshot.full) {
      await Promise.all(snapshotTables(db).map((table) => table.clear()));
    }
    // Defensive: a staff device never keeps owner data, whatever it held before.
    if (snapshot.user.role !== "OWNER") {
      await db.suppliers.clear();
      await db.users.clear();
    }

    await db.categories.bulkPut(snapshot.categories);
    await db.suppliers.bulkPut(snapshot.suppliers);
    await db.users.bulkPut(snapshot.users);
    await db.products.bulkPut(snapshot.products.map(toCatalogProduct));
    await db.sales.bulkPut(snapshot.sales);
    await db.refunds.bulkPut(snapshot.refunds);
    await db.inventoryChanges.bulkPut(snapshot.inventoryChanges);

    if (!snapshot.full) {
      await dropMissing(db.categories, snapshot.categoryIds);
      await dropMissing(db.suppliers, snapshot.supplierIds);
      await dropMissing(db.users, snapshot.userIds);
      // A renamed category relabels the products in it that didn't change themselves.
      for (const category of snapshot.categories) {
        await db.products
          .where("categoryId")
          .equals(category.id)
          .modify({ categoryName: category.name });
      }
    }

    await reapplyOutbox(
      db,
      snapshot.full ? "all" : new Set(snapshot.products.map((product) => product.id)),
      snapshot.user.role,
    );

    await db.meta.bulkPut([
      { key: META.syncedAt, value: syncedAt.toISOString() },
      { key: META.cursor, value: snapshot.cursor },
      { key: META.userId, value: snapshot.user.id },
      { key: META.role, value: snapshot.user.role },
    ]);
  });
}

/**
 * Makes the next download a full one (leaf 9.4). Called when a change is refused or discarded:
 * the device still shows what it did, and only a full snapshot replaces every record it touched.
 */
export async function forgetSnapshotCursor(db: OfflineDb = offlineDb()): Promise<void> {
  await db.meta.delete(META.cursor);
}

async function dropMissing(table: OfflineDb["categories" | "suppliers" | "users"], ids: string[]) {
  const keep = new Set(ids);
  const stored = (await table.toCollection().primaryKeys()) as string[];
  const gone = stored.filter((id) => !keep.has(id));
  if (gone.length > 0) await table.bulkDelete(gone);
}

/**
 * Removes everything staff may not see: suppliers, user accounts, purchase prices, supplier
 * links, and sale-line costs. What any signed-in user may see stays, so the device keeps
 * working offline; the next owner sign-in downloads the rest again. The outbox is kept.
 */
export async function purgeOwnerData(db: OfflineDb = offlineDb()): Promise<void> {
  await db.transaction("rw", snapshotTables(db), async () => {
    await db.suppliers.clear();
    await db.users.clear();
    await db.products.toCollection().modify({ purchasePrice: null, supplierId: null });
    await db.sales.toCollection().modify((sale) => {
      sale.items = sale.items.map((item) => ({ ...item, unitCost: null }));
    });
    // Whatever the device now holds, it is no longer a copy of the owner's data.
    const role = await db.meta.get(META.role);
    if (role?.value !== "STAFF") {
      await db.meta.bulkDelete([META.cursor, META.userId, META.role]);
    }
  });
}

function isSnapshot(body: unknown): body is Snapshot {
  const s = body as Partial<Snapshot> | null;
  return (
    typeof s === "object" &&
    s !== null &&
    s.version === SNAPSHOT_VERSION &&
    typeof s.full === "boolean" &&
    typeof s.cursor === "string" &&
    typeof s.user?.id === "string" &&
    (s.user.role === "OWNER" || s.user.role === "STAFF") &&
    [
      s.products,
      s.categories,
      s.categoryIds,
      s.suppliers,
      s.supplierIds,
      s.users,
      s.userIds,
      s.sales,
      s.refunds,
      s.inventoryChanges,
    ].every(Array.isArray)
  );
}

/**
 * Downloads what changed since the last sync (everything on a user's first one) and stores it.
 * Returns false when the server can't be reached, refuses (e.g. signed out), or replies with
 * something unexpected; what the device held is then kept.
 */
export async function syncDeviceData(db: OfflineDb = offlineDb()): Promise<boolean> {
  const [cursor, owner] = await Promise.all([db.meta.get(META.cursor), deviceDataOwner(db)]);
  const params = new URLSearchParams();
  if (cursor && owner) {
    params.set("since", cursor.value);
    params.set("user", owner.id);
    params.set("role", owner.role);
  }
  const url = params.size > 0 ? `/api/catalog?${params}` : "/api/catalog";

  let body: unknown;
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return false;
    body = await response.json();
  } catch {
    return false;
  }
  if (!isSnapshot(body)) return false;
  await applySnapshot(body, new Date(), db);
  return true;
}

/** Leaf 6.1's name for syncDeviceData(), kept for its callers. */
export const refreshCatalog = syncDeviceData;

export type PersistResult = "persisted" | "denied" | "unsupported";

/**
 * Asks the browser to keep this site's data even when storage runs low or the app goes unused
 * for days, so a shop that stays offline doesn't lose its copy (C96).
 */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, "persist" | "persisted"> | undefined = globalThis.navigator
    ?.storage,
): Promise<PersistResult> {
  if (typeof storage?.persist !== "function") return "unsupported";
  try {
    if (typeof storage.persisted === "function" && (await storage.persisted())) return "persisted";
    return (await storage.persist()) ? "persisted" : "denied";
  } catch {
    return "unsupported";
  }
}

function rank(product: CatalogProduct, q: string): number {
  if (product.barcodeLower === q || product.codeLower === q) return 0;
  if (product.codeLower.startsWith(q)) return 1;
  if (product.nameLower.startsWith(q)) return 2;
  return 3;
}

/**
 * Products in use whose name or code contains the query, or whose barcode equals it, best
 * matches first: exact barcode or code, then code prefix, then name prefix, then the rest by name.
 */
export async function searchCatalog(
  rawQuery: string,
  db: OfflineDb = offlineDb(),
): Promise<SearchHit[]> {
  const q = normalize(rawQuery).toLowerCase();
  if (!q) return [];
  const matches = await db.products
    .filter(
      (p) =>
        inUse(p) && (p.nameLower.includes(q) || p.codeLower.includes(q) || p.barcodeLower === q),
    )
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

/** The product in use with this barcode, else the one with this product code (FR-028). */
export async function lookupCatalog(
  rawCode: string,
  db: OfflineDb = offlineDb(),
): Promise<SearchHit | null> {
  const code = normalize(rawCode).toLowerCase();
  if (!code) return null;
  const product =
    (await db.products.where("barcodeLower").equals(code).filter(inUse).first()) ??
    (await db.products.where("codeLower").equals(code).filter(inUse).first());
  return product ? toHit(product) : null;
}
