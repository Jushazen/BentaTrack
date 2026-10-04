// One sale (FR-012) with its refunds and the refund form (FR-039, FR-040). Leaf 4.2.
// The page itself is SaleDetailView, which the offline app also draws (leaf 9.3).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSale } from "@/features/refunds/queries";
import { SaleDetailView } from "@/features/refunds/sale-detail-view";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Sale · BentaTrack" };

export default async function SaleDetailPage({ params }: PageProps<"/sales/[id]">) {
  const user = await requirePageCapability("sales.read");
  const { id } = await params;
  const result = await getSale(id);
  if (!result.ok) notFound();
  return <SaleDetailView role={user.role} sale={result.data} />;
}
