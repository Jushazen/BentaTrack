// Suppliers (owner only; FR-041–042). Leaf 3.3. The page itself is SuppliersView, which the
// offline app also draws (leaf 9.2).
import type { Metadata } from "next";
import { listSuppliers } from "@/features/suppliers/queries";
import { SuppliersView } from "@/features/suppliers/suppliers-view";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Suppliers · BentaTrack" };

export default async function SuppliersPage() {
  await requirePageCapability("suppliers.manage");
  return <SuppliersView suppliers={await listSuppliers()} />;
}
