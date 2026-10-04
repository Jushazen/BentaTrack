// Add product (FR-001, FR-002). Leaf 3.2. Staff see no purchase price or supplier fields.
// The page itself is ProductFormView, which the offline app also draws (leaf 9.2).
import type { Metadata } from "next";
import { listCategoryOptions } from "@/features/categories/queries";
import { ProductFormView } from "@/features/products/product-form-view";
import { ACCEPTED_IMAGE_TYPES } from "@/features/products/schemas";
import { listSupplierOptions } from "@/features/suppliers/queries";
import { requirePageCapability } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAX_IMAGE_BYTES } from "@/lib/storage";

export const metadata: Metadata = { title: "Add product · BentaTrack" };

export default async function NewProductPage() {
  const user = await requirePageCapability("products.create");
  const [categories, suppliers] = await Promise.all([
    listCategoryOptions(),
    can(user.role, "suppliers.read") ? listSupplierOptions() : null,
  ]);

  return (
    <ProductFormView
      categories={categories.ok ? categories.data : []}
      suppliers={suppliers?.ok ? suppliers.data : null}
      imageRules={{ maxBytes: MAX_IMAGE_BYTES, acceptedTypes: ACCEPTED_IMAGE_TYPES }}
    />
  );
}
