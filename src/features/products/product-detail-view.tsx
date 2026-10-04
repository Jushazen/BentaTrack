// A product's details (FR-002, FR-006, FR-009; leaves 3.2, 3.4), drawn by the server page online
// and by the offline app from the device store (leaf 9.2). Purchase price and supplier appear
// only for the owner (FR-042), and `product.costs` is null for staff; only the owner archives
// and restores (FR-004, H1). An archived product is read-only until restored (FR-059).
import { ArrowLeft, History, Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { RestockForm } from "@/features/inventory/restock-form";
import type { Role } from "@/generated/prisma/enums";
import { formatPeso } from "@/lib/money";
import { can } from "@/lib/permissions";
import { ArchiveProductButton, RestoreProductButton } from "./archive-product-buttons";
import { ArchivedBadge, NeedsCostBadge, StockStatusBadge } from "./product-badges";
import { ProductImage } from "./product-image";
import type { ProductDetail } from "./queries";

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

export function ProductDetailView({ role, product }: { role: Role; product: ProductDetail }) {
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
              {product.archived && <ArchivedBadge />}
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

          {product.archived && (
            <p className="text-muted">
              This product is archived as discontinued. It can&apos;t be sold, restocked, or edited
              until the owner restores it.
            </p>
          )}

          {!product.archived && can(role, "inventory.restock") && (
            <RestockForm productId={product.id} productName={product.name} />
          )}

          <div className="flex flex-wrap items-start gap-2">
            {can(role, "inventory.history") && (
              <Link
                href={`/inventory-history?product=${product.id}`}
                className={buttonClasses("secondary")}
              >
                <History aria-hidden className="size-4 shrink-0" />
                <span>View history</span>
              </Link>
            )}
            {!product.archived && can(role, "products.update") && (
              <Link href={`/products/${product.id}/edit`} className={buttonClasses("primary")}>
                <Pencil aria-hidden className="size-4 shrink-0" />
                <span>Edit product</span>
              </Link>
            )}
            {can(role, "products.archive") &&
              (product.archived ? (
                <RestoreProductButton id={product.id} name={product.name} />
              ) : (
                <ArchiveProductButton id={product.id} name={product.name} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
