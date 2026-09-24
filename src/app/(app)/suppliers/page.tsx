// Suppliers (owner only; FR-041–042). Leaf 3.3.
import type { Metadata } from "next";
import { listSuppliers } from "@/features/suppliers/queries";
import { SupplierManager } from "@/features/suppliers/supplier-manager";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Suppliers · BentaTrack" };

export default async function SuppliersPage() {
  await requirePageCapability("suppliers.manage");
  const suppliers = await listSuppliers();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-text">Suppliers</h1>
        <p className="text-muted mt-1">
          Who you buy stock from. Only you can see supplier details; staff never do.
        </p>
      </div>
      {suppliers.ok ? (
        <SupplierManager suppliers={suppliers.data} />
      ) : (
        <p role="alert" className="text-danger">
          {suppliers.error.message}
        </p>
      )}
    </div>
  );
}
