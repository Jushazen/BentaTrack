// The categories page (owner only; FR-043; leaf 3.3), drawn by the server page online and by the
// offline app from the device store (leaf 9.2).
import type { Result } from "@/lib/result";
import { CategoryManager } from "./category-manager";
import type { CategoryRow } from "./queries";

export function CategoriesView({ categories }: { categories: Result<CategoryRow[]> }) {
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
