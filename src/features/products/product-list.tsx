// Product list with filters (FR-006, FR-009). Server component: the filter form is a plain GET
// form, so it works before JavaScript loads. One row layout for every screen size: a card on
// phones that lines up into columns on wider screens.
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { formatPeso } from "@/lib/money";
import { NeedsCostBadge, StockStatusBadge } from "./product-badges";
import { ProductImage } from "./product-image";
import type { ProductListItem, ProductPage } from "./queries";

type Option = { id: string; name: string };

// Same look as inputClasses in components/ui/field.tsx. That module is "use client", so a server
// component importing a plain string from it would receive a client reference instead.
const inputClasses = "border-border bg-bg text-text w-full rounded-lg border px-3 py-2.5 text-base";

function pageHref(filters: ProductPage["filters"], page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.stock) params.set("stock", filters.stock);
  if (filters.cost) params.set("cost", filters.cost);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

function Filters({
  filters,
  categories,
  showCostFilter,
}: {
  filters: ProductPage["filters"];
  categories: Option[];
  showCostFilter: boolean;
}) {
  const label = "text-text block text-sm font-medium";
  return (
    <form
      method="get"
      action="/products"
      role="search"
      aria-label="Filter products"
      className="bg-surface grid gap-3 rounded-lg p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
    >
      <div className="space-y-1.5">
        <label htmlFor="product-q" className={label}>
          Search
        </label>
        <input
          id="product-q"
          name="q"
          type="search"
          defaultValue={filters.q ?? ""}
          placeholder="Name, code, or barcode"
          className={inputClasses}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="product-category" className={label}>
          Category
        </label>
        <select
          id="product-category"
          name="category"
          defaultValue={filters.category ?? ""}
          className={inputClasses}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="product-stock" className={label}>
          Stock
        </label>
        <select
          id="product-stock"
          name="stock"
          defaultValue={filters.stock ?? ""}
          className={inputClasses}
        >
          <option value="">All stock levels</option>
          <option value="low">Low or out of stock</option>
          <option value="out">Out of stock only</option>
        </select>
      </div>
      <button type="submit" className={buttonClasses("secondary")}>
        <Search aria-hidden className="size-4 shrink-0" />
        <span>Apply filters</span>
      </button>
      {showCostFilter && (
        <label className="text-text flex min-h-11 items-center gap-2 text-sm md:col-span-4">
          <input
            type="checkbox"
            name="cost"
            value="missing"
            defaultChecked={filters.cost === "missing"}
            className="size-4"
          />
          Only products that need a purchase price
        </label>
      )}
    </form>
  );
}

function ProductRow({ product }: { product: ProductListItem }) {
  return (
    <li>
      <Link
        href={`/products/${product.id}`}
        className="hover:bg-secondary flex items-center gap-3 rounded-lg p-3 transition-colors duration-150 ease-out"
      >
        <ProductImage url={product.imageUrl} name={product.name} size="thumb" />
        <div className="grid min-w-0 flex-1 gap-x-4 gap-y-1 md:grid-cols-[2fr_1fr_1fr_1fr] md:items-center">
          <div className="min-w-0">
            <p className="text-text truncate font-medium">{product.name}</p>
            <p className="text-muted truncate text-sm">
              {product.code} · {product.categoryName}
            </p>
          </div>
          <p className="text-text text-sm md:text-right md:text-base">
            <span className="sr-only">Price: </span>
            {formatPeso(product.sellingPrice)}
          </p>
          <p className="text-muted text-sm md:text-right">{product.stockQuantity} in stock</p>
          <p className="flex flex-wrap gap-1.5 md:justify-end">
            <StockStatusBadge status={product.status} />
            {product.needsCost && <NeedsCostBadge />}
          </p>
        </div>
      </Link>
    </li>
  );
}

export function ProductList({
  data,
  categories,
  showCostFilter,
}: {
  data: ProductPage;
  categories: Option[];
  showCostFilter: boolean;
}) {
  const { items, total, page, pageCount, filters } = data;
  const filtered = Boolean(filters.q || filters.category || filters.stock || filters.cost);
  return (
    <>
      <Filters filters={filters} categories={categories} showCostFilter={showCostFilter} />
      <section aria-labelledby="product-list-title" className="bg-surface rounded-lg p-2 lg:p-3">
        <h2 id="product-list-title" className="text-muted px-3 pt-2 pb-1 text-sm">
          {total === 1 ? "1 product" : `${total.toLocaleString("en-PH")} products`}
          {filtered && " match these filters"}
        </h2>
        {items.length === 0 ? (
          <p className="text-muted px-3 py-4">
            {filtered
              ? "No products match. Try other filters."
              : "No products yet. Add the first one."}
          </p>
        ) : (
          <ul aria-label="Products" className="divide-border divide-y">
            {items.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </ul>
        )}
      </section>
      {pageCount > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2">
          {page > 1 ? (
            <Link href={pageHref(filters, page - 1)} className={buttonClasses("secondary")}>
              <ChevronLeft aria-hidden className="size-4 shrink-0" />
              <span>Previous</span>
            </Link>
          ) : (
            <span />
          )}
          <p className="text-muted text-sm">
            Page {page} of {pageCount}
          </p>
          {page < pageCount ? (
            <Link href={pageHref(filters, page + 1)} className={buttonClasses("secondary")}>
              <span>Next</span>
              <ChevronRight aria-hidden className="size-4 shrink-0" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
