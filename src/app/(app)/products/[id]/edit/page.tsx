// Edit product (FR-003). Leaf 3.2. Every saved change is logged in the inventory history.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCategoryOptions } from "@/features/categories/queries";
import { ProductForm } from "@/features/products/product-form";
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-text">Edit {product.data.name}</h1>
        <p className="text-muted mt-1">Changes are recorded in the inventory history.</p>
      </div>
      <ProductForm
        product={product.data}
        categories={categories.ok ? categories.data : []}
        suppliers={suppliers?.ok ? suppliers.data : null}
        imageRules={{ maxBytes: MAX_IMAGE_BYTES, acceptedTypes: ACCEPTED_IMAGE_TYPES }}
      />
    </div>
  );
}
