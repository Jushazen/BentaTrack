// Categories (owner only; FR-043). Leaf 3.3.
import type { Metadata } from "next";
import { CategoryManager } from "@/features/categories/category-manager";
import { listCategories } from "@/features/categories/queries";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Categories · BentaTrack" };

export default async function CategoriesPage() {
  await requirePageCapability("categories.manage");
  const categories = await listCategories();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-text">Categories</h1>
        <p className="text-muted mt-1">
          Group products, e.g. Bags, Accessories, Perfumes. A category with products can&apos;t be
          deleted.
        </p>
      </div>
      {categories.ok ? (
        <CategoryManager categories={categories.data} />
      ) : (
        <p role="alert" className="text-danger">
          {categories.error.message}
        </p>
      )}
    </div>
  );
}
