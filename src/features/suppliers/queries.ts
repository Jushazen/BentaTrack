// Server-side reads: Owner-only supplier records (FR-041–042). Leaf 3.3.
// Every read needs suppliers.read, which staff don't have (FR-032, FR-042).
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, type Result } from "@/lib/result";

export type SupplierOption = { id: string; name: string };

export type SupplierRow = SupplierOption & {
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  productCount: number;
};

export const supplierRowSelect = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
  _count: { select: { products: true } },
} as const;

export function toSupplierRow({
  _count,
  ...supplier
}: Omit<SupplierRow, "productCount"> & { _count: { products: number } }): SupplierRow {
  return { ...supplier, productCount: _count.products };
}

export async function listSuppliers(): Promise<Result<SupplierRow[]>> {
  const auth = await requireCapability("suppliers.read");
  if (!auth.ok) return auth;
  const rows = await db.supplier.findMany({ select: supplierRowSelect, orderBy: { name: "asc" } });
  return ok(rows.map(toSupplierRow));
}

/** Supplier names for the owner's product form (leaf 3.2). */
export async function listSupplierOptions(): Promise<Result<SupplierOption[]>> {
  const auth = await requireCapability("suppliers.read");
  if (!auth.ok) return auth;
  return ok(
    await db.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  );
}
