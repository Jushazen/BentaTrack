// On-device database (IndexedDB via Dexie) for offline use (§4.9, §5.3). Leaf 6.1.
// - products: a copy of the catalog, so search and barcode lookup work without a connection.
// - meta: small key/value facts, e.g. when the catalog was last refreshed.
// - outbox: sales, refunds, and restocks waiting to be sent to the server (filled by leaf 6.2).
// Browser only: import from client components or client-side modules, never from the server.
import Dexie, { type EntityTable } from "dexie";

export const OFFLINE_DB_NAME = "bentatrack";

/** One product as the offline catalog keeps it. Same fields as a search hit, no costs. */
export type CatalogProduct = {
  id: string;
  name: string;
  code: string;
  barcode: string | null;
  brand: string | null;
  categoryName: string;
  sellingPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  /** Lower-cased copies for case-insensitive matching and indexed exact lookups. */
  nameLower: string;
  codeLower: string;
  barcodeLower: string | null;
};

export type MetaEntry = { key: string; value: string };

export type OutboxKind = "SALE" | "REFUND" | "RESTOCK";

/** A change recorded offline. `id` is the client-generated UUID the server uses to de-duplicate. */
export type OutboxEntry = {
  id: string;
  kind: OutboxKind;
  payload: unknown;
  /** Epoch milliseconds when it was recorded; entries are sent oldest first. */
  createdAt: number;
  attempts: number;
  lastError: string | null;
};

export type OfflineDb = Dexie & {
  products: EntityTable<CatalogProduct, "id">;
  meta: EntityTable<MetaEntry, "key">;
  outbox: EntityTable<OutboxEntry, "id">;
};

export function openOfflineDb(name = OFFLINE_DB_NAME): OfflineDb {
  const db = new Dexie(name) as OfflineDb;
  db.version(1).stores({
    products: "id, codeLower, barcodeLower",
    meta: "key",
    outbox: "id, createdAt",
  });
  return db;
}

let shared: OfflineDb | null = null;

/** The app's one on-device database, opened on first use. */
export function offlineDb(): OfflineDb {
  shared ??= openOfflineDb();
  return shared;
}
