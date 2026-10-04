// The suppliers page (owner only; FR-041–042; leaf 3.3), drawn by the server page online and by
// the offline app from the device store (leaf 9.2).
import type { Result } from "@/lib/result";
import type { SupplierRow } from "./queries";
import { SupplierManager } from "./supplier-manager";

export function SuppliersView({ suppliers }: { suppliers: Result<SupplierRow[]> }) {
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
