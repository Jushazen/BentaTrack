// Product details (FR-002, FR-006, FR-009). Leaf 3.2. Restock and history link: leaf 3.4.
// The page itself is ProductDetailView, which the offline app also draws (leaf 9.2).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailView } from "@/features/products/product-detail-view";
import { getProduct } from "@/features/products/queries";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Product · BentaTrack" };

export default async function ProductDetailPage({ params }: PageProps<"/products/[id]">) {
  const user = await requirePageCapability("products.read");
  const { id } = await params;
  const result = await getProduct(id);
  if (!result.ok) notFound();
  return <ProductDetailView role={user.role} product={result.data} />;
}
