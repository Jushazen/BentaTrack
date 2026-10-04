// Categories and suppliers read from the device store (FR-043, FR-041; leaf 9.2). Same rows and
// order as src/features/categories/queries.ts and src/features/suppliers/queries.ts. Suppliers
// are owner only: a staff device holds none, and these refuse staff anyway (FR-032, FR-042).
import type { CategoryOption, CategoryRow } from "@/features/categories/queries";
import type { SupplierOption, SupplierRow } from "@/features/suppliers/queries";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";
import type { SnapshotCategory, SnapshotProduct, SnapshotSupplier } from "../snapshot";
import { compareText } from "./compare";

const FORBIDDEN = fail("FORBIDDEN", "You don't have access to that.");

function byName<T extends { id: string; name: string }>(rows: T[]): T[] {
  // The database orders by name alone; names are unique, and the id only makes ties stable.
  return [...rows].sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
}

/** How many products (archived ones too, as the database counts them) use each id. */
function countBy(products: SnapshotProduct[], key: "categoryId" | "supplierId") {
  const counts = new Map<string, number>();
  for (const product of products) {
    const id = product[key];
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function listCategoriesFrom(
  { categories, products }: { categories: SnapshotCategory[]; products: SnapshotProduct[] },
  role: Role,
): Result<CategoryRow[]> {
  if (!can(role, "categories.manage")) return FORBIDDEN;
  const counts = countBy(products, "categoryId");
  return ok(
    byName(categories).map((c) => ({
      id: c.id,
      name: c.name,
      productCount: counts.get(c.id) ?? 0,
    })),
  );
}

export function categoryOptionsFrom(
  categories: SnapshotCategory[],
  role: Role,
): Result<CategoryOption[]> {
  if (!can(role, "categories.read")) return FORBIDDEN;
  return ok(byName(categories).map((c) => ({ id: c.id, name: c.name })));
}

export function listSuppliersFrom(
  { suppliers, products }: { suppliers: SnapshotSupplier[]; products: SnapshotProduct[] },
  role: Role,
): Result<SupplierRow[]> {
  if (!can(role, "suppliers.read")) return FORBIDDEN;
  const counts = countBy(products, "supplierId");
  return ok(
    byName(suppliers).map((s) => ({
      id: s.id,
      name: s.name,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      productCount: counts.get(s.id) ?? 0,
    })),
  );
}

export function supplierOptionsFrom(
  suppliers: SnapshotSupplier[],
  role: Role,
): Result<SupplierOption[]> {
  if (!can(role, "suppliers.read")) return FORBIDDEN;
  return ok(byName(suppliers).map((s) => ({ id: s.id, name: s.name })));
}
