// Role-scoped snapshot of everything a user may see, for the device's offline copy (FR-055,
// FR-049, FR-050). Leaf 9.1. Built and served by /api/catalog; applied on the device by
// applySnapshot() in ./catalog.ts.
//
// - The first sync of a user on a device gets everything ("full"). Later syncs pass back the
//   cursor of the last reply and get only rows changed since then, re-reading a short overlap so
//   a row whose transaction committed while the previous snapshot was being read isn't missed.
// - Categories and suppliers are deleted outright, so every reply also lists the ids that still
//   exist; the device drops the rest. Archived products are sent like any other change.
// - Staff (FR-032) never receive purchase prices, sale-line costs, supplier links, suppliers, or
//   user accounts. Sales, refunds, and history carry the person's name instead.
// This module holds only the shape and constants, so the browser can import it; the server
// builds snapshots in src/app/api/catalog/device-snapshot.ts.
import type {
  DiscountType,
  InventoryChangeType,
  PaymentMethod,
  Role,
} from "@/generated/prisma/client";

export const SNAPSHOT_VERSION = 1;

/** Rows changed this long before the previous cursor are sent again. Covers slow commits and clock skew. */
export const SNAPSHOT_OVERLAP_MS = 60_000;

export type SnapshotProduct = {
  id: string;
  name: string;
  code: string;
  barcode: string | null;
  brand: string | null;
  categoryId: string;
  categoryName: string;
  /** Owner only; always null for staff. */
  supplierId: string | null;
  /** Centavos. Owner only; always null for staff. */
  purchasePrice: number | null;
  sellingPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  /** YYYY-MM-DD. */
  expirationDate: string | null;
  imageUrl: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SnapshotCategory = { id: string; name: string; createdAt: string; updatedAt: string };

export type SnapshotSupplier = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A user account as the owner's device keeps it. Never a password hash. */
export type SnapshotUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SnapshotSaleItem = {
  id: string;
  productId: string | null;
  productName: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  /** Owner only; always null for staff. */
  unitCost: number | null;
  refundedQuantity: number;
};

export type SnapshotSale = {
  id: string;
  occurredAt: string;
  recordedAt: string;
  staffId: string;
  staffName: string;
  customerInfo: string | null;
  subtotal: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  discountAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  items: SnapshotSaleItem[];
};

export type SnapshotRefund = {
  id: string;
  saleId: string;
  occurredAt: string;
  recordedAt: string;
  userId: string;
  userName: string;
  amount: number;
  note: string | null;
  items: {
    id: string;
    saleItemId: string;
    quantity: number;
    amount: number;
    returnedToStock: boolean;
  }[];
};

export type SnapshotInventoryChange = {
  id: string;
  productId: string | null;
  productName: string;
  productCode: string;
  type: InventoryChangeType;
  quantityChange: number;
  stockAfter: number;
  saleId: string | null;
  refundId: string | null;
  userId: string;
  userName: string;
  note: string | null;
  occurredAt: string;
  recordedAt: string;
};

export type Snapshot = {
  version: typeof SNAPSHOT_VERSION;
  /** True when this reply holds everything and replaces what the device had. */
  full: boolean;
  /** Pass back as `since` on the next sync. */
  cursor: string;
  /** Who the data was scoped for. */
  user: { id: string; role: Role };
  products: SnapshotProduct[];
  categories: SnapshotCategory[];
  /** Every category that still exists. */
  categoryIds: string[];
  suppliers: SnapshotSupplier[];
  /** Every supplier that still exists; empty for staff. */
  supplierIds: string[];
  users: SnapshotUser[];
  /** Every user account; empty for staff. */
  userIds: string[];
  sales: SnapshotSale[];
  refunds: SnapshotRefund[];
  inventoryChanges: SnapshotInventoryChange[];
};
