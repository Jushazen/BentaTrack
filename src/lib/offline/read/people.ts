// User accounts and inventory history read from the device store (FR-044, FR-010–012; leaf 9.2).
// Same rows, filters, order, and paging as listUsers() in src/features/users/queries.ts and
// listInventoryChanges() in src/features/inventory/queries.ts.
import type { HistoryPage } from "@/features/inventory/queries";
import { HISTORY_PAGE_SIZE, historyFiltersSchema } from "@/features/inventory/schemas";
import type { UserRow } from "@/features/users/queries";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";
import type { SnapshotInventoryChange, SnapshotProduct, SnapshotUser } from "../snapshot";
import { compareText, containsInsensitive, pageOf } from "./compare";

const FORBIDDEN = fail("FORBIDDEN", "You don't have access to that.");

/** Database order of the Role enum: OWNER, then STAFF. */
const ROLE_ORDER: Record<Role, number> = { OWNER: 0, STAFF: 1 };

/** Owner first, then active accounts before deactivated ones, then by name. Owner only. */
export function listUsersFrom(users: SnapshotUser[], role: Role): Result<UserRow[]> {
  if (!can(role, "users.manage")) return FORBIDDEN;
  return ok(
    [...users]
      .sort(
        (a, b) =>
          ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
          Number(b.active) - Number(a.active) ||
          compareText(a.name, b.name) ||
          compareText(a.id, b.id),
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        createdAt: new Date(u.createdAt),
      })),
  );
}

/** Newer first: by when it happened, then when it was recorded, then id (as the server does). */
function newestFirst(a: SnapshotInventoryChange, b: SnapshotInventoryChange): number {
  return (
    Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
    Date.parse(b.recordedAt) - Date.parse(a.recordedAt) ||
    compareText(b.id, a.id)
  );
}

/** Inventory history, newest first, filtered and paged from the URL's search params. */
export function listInventoryChangesFrom(
  {
    inventoryChanges,
    products,
  }: { inventoryChanges: SnapshotInventoryChange[]; products: SnapshotProduct[] },
  role: Role,
  rawFilters: unknown = {},
): Result<HistoryPage> {
  if (!can(role, "inventory.history")) return FORBIDDEN;
  const filters = historyFiltersSchema.parse(rawFilters ?? {});
  const page = filters.page ?? 1;
  const matches = filters.q ? containsInsensitive(filters.q) : null;

  const rows = inventoryChanges
    .filter(
      (c) =>
        (!filters.product || c.productId === filters.product) &&
        (!filters.type || c.type === filters.type) &&
        (!matches || matches(c.productName) || matches(c.productCode)),
    )
    .sort(newestFirst);

  const product = filters.product ? products.find((p) => p.id === filters.product) : undefined;
  const { items, ...counts } = pageOf(rows, page, HISTORY_PAGE_SIZE);
  return ok({
    items: items.map((c) => ({
      id: c.id,
      occurredAt: new Date(c.occurredAt),
      type: c.type,
      quantityChange: c.quantityChange,
      stockAfter: c.stockAfter,
      productId: c.productId,
      productName: c.productName,
      productCode: c.productCode,
      note: c.note,
      userName: c.userName,
    })),
    ...counts,
    filters,
    productLabel: product ? { name: product.name, code: product.code } : null,
  });
}
