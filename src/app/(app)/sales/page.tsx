// Sales history (FR-012): every sale, newest first, searchable by product or customer. Leaf 4.2.
import type { Metadata } from "next";
import { listSales } from "@/features/refunds/queries";
import { SalesList } from "@/features/refunds/sales-list";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Sales · BentaTrack" };

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  await requirePageCapability("sales.read");
  const sales = await listSales(await searchParams);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-text">Sales</h1>
        <p className="text-muted mt-1">Open a sale to see its items or refund it.</p>
      </div>
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
