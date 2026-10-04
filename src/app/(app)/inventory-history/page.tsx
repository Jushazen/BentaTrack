// Inventory history (FR-010–012): every sale, restock, edit, refund, and removal, newest first,
// filterable by product and change type. Leaf 3.4. The page itself is HistoryView, which the
// offline app also draws (leaf 9.2).
import type { Metadata } from "next";
import { HistoryView } from "@/features/inventory/history-view";
import { listInventoryChanges } from "@/features/inventory/queries";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Inventory history · BentaTrack" };

export default async function InventoryHistoryPage({
  searchParams,
}: PageProps<"/inventory-history">) {
  await requirePageCapability("inventory.history");
  return <HistoryView history={await listInventoryChanges(await searchParams)} />;
}
