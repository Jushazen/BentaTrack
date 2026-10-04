// Loads what the offline pages need from the device store (leaf 9.2). Browser only.
import { deviceDataOwner } from "../catalog";
import {
  offlineDb,
  type CatalogProduct,
  type DeviceCategory,
  type DeviceInventoryChange,
  type DeviceSupplier,
  type DeviceUser,
  type OfflineDb,
} from "../db";
import { savedSession, type SavedSession } from "./session";

/**
 * The signed-in user, if this device holds their data. Null before their first sync, after
 * signing out, or while the device still holds someone else's data: the offline pages are then
 * not drawn and the plain offline notice shows instead (§3.1).
 */
export async function offlineViewer(
  db: OfflineDb = offlineDb(),
  cacheStorage?: CacheStorage,
): Promise<SavedSession | null> {
  const [session, owner] = await Promise.all([savedSession(cacheStorage), deviceDataOwner(db)]);
  if (!session || !owner || owner.id !== session.id || owner.role !== session.role) return null;
  return session;
}

export type DeviceRecords = {
  products: CatalogProduct[];
  categories: DeviceCategory[];
  suppliers: DeviceSupplier[];
  users: DeviceUser[];
  inventoryChanges: DeviceInventoryChange[];
};

/** Every stored record the offline pages use, read in one transaction so they agree. */
export async function readDeviceRecords(db: OfflineDb = offlineDb()): Promise<DeviceRecords> {
  return db.transaction(
    "r",
    [db.products, db.categories, db.suppliers, db.users, db.inventoryChanges],
    async () => {
      const [products, categories, suppliers, users, inventoryChanges] = await Promise.all([
        db.products.toArray(),
        db.categories.toArray(),
        db.suppliers.toArray(),
        db.users.toArray(),
        db.inventoryChanges.toArray(),
      ]);
      return { products, categories, suppliers, users, inventoryChanges };
    },
  );
}
