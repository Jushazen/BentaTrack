// The products page (FR-001–006, FR-009; leaves 3.2, 3.5), drawn by the server page online and by
// the offline app from the device store (leaf 9.2).
import { Plus } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import type { CategoryOption } from "@/features/categories/queries";
import { ProductFinder } from "@/features/search/product-finder";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import type { Result } from "@/lib/result";
import { ProductList } from "./product-list";
import type { ProductPage } from "./queries";

export function ProductsView({
  role,
  products,
  categories,
}: {
  role: Role;
  products: Result<ProductPage>;
  categories: CategoryOption[];
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-text">Products</h1>
          <p className="text-muted mt-1">Everything in the store, with how many are left.</p>
        </div>
        {can(role, "products.create") && (
          <Link href="/products/new" className={buttonClasses("primary")}>
            <Plus aria-hidden className="size-4 shrink-0" />
            <span>Add product</span>
          </Link>
        )}
      </div>
      {can(role, "search") && <ProductFinder />}
      {products.ok ? (
        <ProductList
          data={products.data}
          categories={categories}
          showCostFilter={can(role, "products.cost")}
          showArchivedFilter={can(role, "products.archive")}
        />
      ) : (
        <p role="alert" className="text-danger">
          {products.error.message}
        </p>
      )}
    </div>
  );
}
