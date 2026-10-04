// Sales history (FR-012): every sale, newest first, searchable by product or customer. Leaf 4.2.
// The page itself is SalesView, which the offline app also draws (leaf 9.3).
import type { Metadata } from "next";
import { listSales } from "@/features/refunds/queries";
import { SalesView } from "@/features/refunds/sales-view";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Sales · BentaTrack" };

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  await requirePageCapability("sales.read");
  return <SalesView sales={await listSales(await searchParams)} />;
}
