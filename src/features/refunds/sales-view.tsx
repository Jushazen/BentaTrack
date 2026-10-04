// The sales history page (FR-012; leaf 4.2), drawn by the server page online and by the offline
// app from the device store (leaf 9.3).
import type { Result } from "@/lib/result";
import type { SalesPage } from "./queries";
import { SalesList, WaitingNote } from "./sales-list";

export function SalesView({
  sales,
  waitingToSync = 0,
}: {
  sales: Result<SalesPage>;
  /** Offline only: sales and refunds included that haven't synced yet. */
  waitingToSync?: number;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-text">Sales</h1>
        <p className="text-muted mt-1">Open a sale to see its items or refund it.</p>
      </div>
      <WaitingNote count={waitingToSync} />
      {sales.ok ? (
        <SalesList data={sales.data} />
      ) : (
        <p role="alert" className="text-danger">
          {sales.error.message}
        </p>
      )}
    </div>
  );
}
