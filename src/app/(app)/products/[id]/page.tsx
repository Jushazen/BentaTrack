// Product details (FR-002, FR-006, FR-009). Leaf 3.2. Purchase price and supplier appear only for
// the owner (FR-042); only the owner can delete (FR-004). Restock and history link: leaf 3.4.
import { ArrowLeft, History, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { RestockForm } from "@/features/inventory/restock-form";
import { DeleteProductButton } from "@/features/products/delete-product-button";
import { NeedsCostBadge, StockStatusBadge } from "@/features/products/product-badges";
import { ProductImage } from "@/features/products/product-image";
import { getProduct } from "@/features/products/queries";
import { requirePageCapability } from "@/lib/auth";
import { formatPeso } from "@/lib/money";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Product · BentaTrack" };

// Expiration dates are calendar dates stored at UTC midnight; "date added" is shown in Manila time.
const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" });
const addedFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-border flex flex-wrap justify-between gap-x-4 gap-y-1 border-b py-2.5 last:border-b-0">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="text-text text-right">{children}</dd>
    </div>
  );
}

export default async function ProductDetailPage({ params }: PageProps<"/products/[id]">) {
  const user = await requirePageCapability("products.read");
  const { id } = await params;
  const result = await getProduct(id);
  if (!result.ok) notFound();
  const product = result.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/products" className={buttonClasses("ghost", "-ml-4")}>
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        <span>All products</span>
      </Link>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <ProductImage url={product.imageUrl} name={product.name} size="large" />
        <div className="space-y-4">
          <div>
            <h1 className="text-text">{product.name}</h1>
            <p className="text-muted mt-1">
              {product.code} · {product.categoryName}
            </p>
            <p className="mt-3 flex flex-wrap gap-2">
              <StockStatusBadge status={product.status} />
              {product.needsCost && <NeedsCostBadge />}
            </p>
          </div>

          <dl className="bg-surface rounded-lg px-4">
            <Row label="Selling price">{formatPeso(product.sellingPrice)}</Row>
            {product.costs && (
              <>
                <Row label="Purchase price">
                  {product.costs.purchasePrice === null
                    ? "Not set yet"
                    : formatPeso(product.costs.purchasePrice)}
                </Row>
                <Row label="Supplier">{product.costs.supplierName ?? "None"}</Row>
              </>
            )}
            <Row label="In stock">{product.stockQuantity}</Row>
            <Row label="Low stock threshold">{product.lowStockThreshold}</Row>
            <Row label="Barcode">{product.barcode ?? "None"}</Row>
            <Row label="Brand">{product.brand ?? "None"}</Row>
            <Row label="Expiration date">
              {product.expirationDate
                ? dateFormat.format(new Date(`${product.expirationDate}T00:00:00Z`))
                : "None"}
            </Row>
            <Row label="Date added">{addedFormat.format(product.createdAt)}</Row>
          </dl>

          {can(user.role, "inventory.restock") && (
            <RestockForm productId={product.id} productName={product.name} />
          )}

          <div className="flex flex-wrap items-start gap-2">
            {can(user.role, "inventory.history") && (
              <Link
                href={`/inventory-history?product=${product.id}`}
                className={buttonClasses("secondary")}
              >
                <History aria-hidden className="size-4 shrink-0" />
                <span>View history</span>
              </Link>
            )}
            {can(user.role, "products.update") && (
              <Link href={`/products/${product.id}/edit`} className={buttonClasses("primary")}>
                <Pencil aria-hidden className="size-4 shrink-0" />
                <span>Edit product</span>
              </Link>
            )}
            {can(user.role, "products.delete") && (
              <DeleteProductButton id={product.id} name={product.name} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
