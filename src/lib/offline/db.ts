// On-device database (IndexedDB via Dexie) for offline use (§4.9, §5.3, FR-055).
// - products, categories, suppliers, users, sales, refunds, inventoryChanges: a copy of every
//   record the signed-in user may see (leaf 9.1; products only in leaf 6.1). Kept up to date by
//   ./catalog.ts from the role-scoped snapshot in ./snapshot.ts. Staff devices never hold
//   suppliers, users, purchase prices, or sale-line costs.
// - meta: small key/value facts, e.g. the snapshot cursor and whose data the device holds.
// - outbox: changes waiting to be sent to the server (leaf 6.2). Never cleared by a snapshot or a
//   sign-out: nothing recorded offline may be lost (FR-036).
// Browser only: import from client components or client-side modules, never from the server.
import Dexie, { type EntityTable } from "dexie";
import type {
  SnapshotCategory,
  SnapshotInventoryChange,
  SnapshotProduct,
  SnapshotRefund,
  SnapshotSale,
  SnapshotSupplier,
  SnapshotUser,
} from "./snapshot";

export const OFFLINE_DB_NAME = "bentatrack";

/** One product as the device keeps it: the snapshot row plus lower-cased copies for matching. */
export type CatalogProduct = SnapshotProduct & {
  nameLower: string;
  codeLower: string;
  barcodeLower: string | null;
};

export type DeviceCategory = SnapshotCategory;
export type DeviceSupplier = SnapshotSupplier;
export type DeviceUser = SnapshotUser;
export type DeviceSale = SnapshotSale;
export type DeviceRefund = SnapshotRefund;
export type DeviceInventoryChange = SnapshotInventoryChange;

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
  categories: EntityTable<DeviceCategory, "id">;
  suppliers: EntityTable<DeviceSupplier, "id">;
  users: EntityTable<DeviceUser, "id">;
  sales: EntityTable<DeviceSale, "id">;
  refunds: EntityTable<DeviceRefund, "id">;
  inventoryChanges: EntityTable<DeviceInventoryChange, "id">;
  meta: EntityTable<MetaEntry, "key">;
  outbox: EntityTable<OutboxEntry, "id">;
};

/** Values for the fields leaf 6.1's product-only catalog didn't keep. */
export const PRODUCT_DEFAULTS = {
  categoryId: "",
  supplierId: null,
  purchasePrice: null,
  expirationDate: null,
  archivedAt: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
} as const satisfies Partial<SnapshotProduct>;

export function openOfflineDb(name = OFFLINE_DB_NAME): OfflineDb {
  const db = new Dexie(name) as OfflineDb;
  db.version(1).stores({
    products: "id, codeLower, barcodeLower",
    meta: "key",
    outbox: "id, createdAt",
  });
  // Leaf 9.1. The old catalog stays searchable offline until the first full snapshot replaces it
  // (the device has no snapshot cursor yet, so its next sync is a full one).
  db.version(2)
    .stores({
      products: "id, codeLower, barcodeLower, categoryId",
      categories: "id",
      suppliers: "id",
      users: "id",
      sales: "id, occurredAt",
      refunds: "id, saleId, occurredAt",
      inventoryChanges: "id, productId, occurredAt",
    })
    .upgrade((tx) =>
      tx
        .table("products")
        .toCollection()
        .modify((product: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(PRODUCT_DEFAULTS)) product[key] ??= value;
        }),
    );
  return db;
}

let shared: OfflineDb | null = null;

/** The app's one on-device database, opened on first use. */
export function offlineDb(): OfflineDb {
  shared ??= openOfflineDb();
  return shared;
}
