// Inventory history (FR-010–012): every sale, restock, edit, refund, and removal, newest first,
// filterable by product and change type. Leaf 3.4.
import type { Metadata } from "next";
import { HistoryList } from "@/features/inventory/history-list";
import { listInventoryChanges } from "@/features/inventory/queries";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Inventory history · BentaTrack" };

export default async function InventoryHistoryPage({
  searchParams,
}: PageProps<"/inventory-history">) {
  await requirePageCapability("inventory.history");
  const history = await listInventoryChanges(await searchParams);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-text">Inventory history</h1>
        <p className="text-muted mt-1">
          Every change to stock and product details, and who made it.
        </p>
      </div>
      {history.ok ? (
        <HistoryList data={history.data} />
      ) : (
        <p role="alert" className="text-danger">
          {history.error.message}
        </p>
      )}
    </div>
  );
}
