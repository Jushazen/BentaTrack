// Edit product (FR-003). Leaf 3.2. Every saved change is logged in the inventory history.
// Archived products can't be edited until restored (FR-059), so this sends them to their page.
// The page itself is ProductFormView, which the offline app also draws (leaf 9.2).
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { listCategoryOptions } from "@/features/categories/queries";
import { ProductFormView } from "@/features/products/product-form-view";
import { getProduct } from "@/features/products/queries";
import { ACCEPTED_IMAGE_TYPES } from "@/features/products/schemas";
import { listSupplierOptions } from "@/features/suppliers/queries";
import { requirePageCapability } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MAX_IMAGE_BYTES } from "@/lib/storage";

export const metadata: Metadata = { title: "Edit product · BentaTrack" };

export default async function EditProductPage({ params }: PageProps<"/products/[id]/edit">) {
  const user = await requirePageCapability("products.update");
  const { id } = await params;
  const [product, categories, suppliers] = await Promise.all([
    getProduct(id),
    listCategoryOptions(),
    can(user.role, "suppliers.read") ? listSupplierOptions() : null,
  ]);
  if (!product.ok) notFound();
  if (product.data.archived) redirect(`/products/${id}`);

  return (
    <ProductFormView
      product={product.data}
      categories={categories.ok ? categories.data : []}
      suppliers={suppliers?.ok ? suppliers.data : null}
      imageRules={{ maxBytes: MAX_IMAGE_BYTES, acceptedTypes: ACCEPTED_IMAGE_TYPES }}
    />
  );
}
