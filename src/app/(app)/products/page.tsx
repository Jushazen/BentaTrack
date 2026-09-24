// Products (FR-001–006, FR-009). Leaf 3.2. Quick finder with barcode scanning (FR-026–028): leaf 3.5.
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { listCategoryOptions } from "@/features/categories/queries";
import { ProductList } from "@/features/products/product-list";
import { listProducts } from "@/features/products/queries";
import { ProductFinder } from "@/features/search/product-finder";
import { requirePageCapability } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Products · BentaTrack" };

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const user = await requirePageCapability("products.read");
  const [products, categories] = await Promise.all([
    listProducts(await searchParams),
    listCategoryOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-text">Products</h1>
          <p className="text-muted mt-1">Everything in the store, with how many are left.</p>
        </div>
        {can(user.role, "products.create") && (
          <Link href="/products/new" className={buttonClasses("primary")}>
            <Plus aria-hidden className="size-4 shrink-0" />
            <span>Add product</span>
          </Link>
        )}
      </div>
      {can(user.role, "search") && <ProductFinder />}
      {products.ok ? (
        <ProductList
          data={products.data}
          categories={categories.ok ? categories.data : []}
          showCostFilter={can(user.role, "products.cost")}
        />
      ) : (
        <p role="alert" className="text-danger">
          {products.error.message}
        </p>
      )}
    </div>
  );
}
