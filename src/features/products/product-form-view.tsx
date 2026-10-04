// The add and edit product pages (FR-001–003; leaf 3.2), drawn by the server pages online and by
// the offline app from the device store (leaf 9.2). Staff see no purchase price or supplier
// fields (`suppliers` is null for them).
import type { CategoryOption } from "@/features/categories/queries";
import type { SupplierOption } from "@/features/suppliers/queries";
import { ProductForm, type ImageRules } from "./product-form";
import type { ProductDetail } from "./queries";

export function ProductFormView({
  product,
  categories,
  suppliers,
  imageRules,
}: {
  /** The product being edited; absent when adding one. */
  product?: ProductDetail;
  categories: CategoryOption[];
  suppliers: SupplierOption[] | null;
  imageRules: ImageRules;
}) {
  const intro = product
    ? "Changes are recorded in the inventory history."
    : suppliers
      ? "Fill in what you know. Purchase price and supplier can be added later."
      : "The owner adds the purchase price and supplier later.";
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-text">{product ? `Edit ${product.name}` : "Add product"}</h1>
        <p className="text-muted mt-1">{intro}</p>
      </div>
      <ProductForm
        product={product}
        categories={categories}
        suppliers={suppliers}
        imageRules={imageRules}
      />
    </div>
  );
}
