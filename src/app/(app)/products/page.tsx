// Products (FR-001–006, FR-009). Leaf 3.2. Quick finder with barcode scanning (FR-026–028): leaf 3.5.
// The page itself is ProductsView, which the offline app also draws (leaf 9.2).
import type { Metadata } from "next";
import { listCategoryOptions } from "@/features/categories/queries";
import { ProductsView } from "@/features/products/products-view";
import { listProducts } from "@/features/products/queries";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Products · BentaTrack" };

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const user = await requirePageCapability("products.read");
  const [products, categories] = await Promise.all([
    listProducts(await searchParams),
    listCategoryOptions(),
  ]);

  return (
    <ProductsView
      role={user.role}
      products={products}
      categories={categories.ok ? categories.data : []}
    />
  );
}
