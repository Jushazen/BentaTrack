// Products read from the device store (FR-049, FR-055; leaf 9.2). Same filters, order, paging, and
// shapes as listProducts()/getProduct() in src/features/products/queries.ts, so the offline pages
// show what the online ones would. Staff never get purchase prices or suppliers (FR-032, FR-042),
// whatever the device holds.
import { PRODUCT_PAGE_SIZE, productFiltersSchema } from "@/features/products/filters";
import type { ProductDetail, ProductListItem, ProductPage } from "@/features/products/queries";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";
import { stockStatus } from "@/lib/stock-status";
import type { SnapshotCategory, SnapshotProduct, SnapshotSupplier } from "../snapshot";
import { compareText, containsInsensitive, pageOf } from "./compare";

export type ProductRecords = {
  products: SnapshotProduct[];
  /** Current category names; a product's own copy is used if its category is missing. */
  categories: SnapshotCategory[];
};

function seesCosts(role: Role): boolean {
  return can(role, "products.cost") && can(role, "suppliers.read");
}

function categoryNames(categories: SnapshotCategory[]): Map<string, string> {
  return new Map(categories.map((c) => [c.id, c.name]));
}

function toListItem(
  product: SnapshotProduct,
  names: Map<string, string>,
  showCosts: boolean,
): ProductListItem {
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    barcode: product.barcode,
    brand: product.brand,
    sellingPrice: product.sellingPrice,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    imageUrl: product.imageUrl,
    archived: product.archivedAt !== null,
    categoryName: names.get(product.categoryId) ?? product.categoryName,
    status: stockStatus(product.stockQuantity, product.lowStockThreshold),
    needsCost: showCosts && product.purchasePrice === null,
  };
}

/** The product list for `role`, filtered and paged from the URL's search params. */
export function listProductsFrom(
  { products, categories }: ProductRecords,
  role: Role,
  rawFilters: unknown = {},
): Result<ProductPage> {
  if (!can(role, "products.read")) return fail("FORBIDDEN", "You don't have access to that.");
  const showCosts = seesCosts(role);
  const filters = productFiltersSchema.parse(rawFilters ?? {});
  const page = filters.page ?? 1;
  const showArchived = filters.archived === "1" && can(role, "products.archive");
  const q = filters.q;
  const matches = q ? containsInsensitive(q) : null;

  const rows = products
    .filter(
      (p) =>
        (p.archivedAt !== null) === showArchived &&
        (!matches || matches(p.name) || matches(p.code) || p.barcode === q) &&
        (!filters.category || p.categoryId === filters.category) &&
        (filters.stock !== "low" || p.stockQuantity <= p.lowStockThreshold) &&
        (filters.stock !== "out" || p.stockQuantity === 0) &&
        (filters.cost !== "missing" || !showCosts || p.purchasePrice === null),
    )
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.code, b.code));

  const names = categoryNames(categories);
  const { items, ...counts } = pageOf(rows, page, PRODUCT_PAGE_SIZE);
  return ok({
    items: items.map((p) => toListItem(p, names, showCosts)),
    ...counts,
    filters: showArchived ? filters : { ...filters, archived: undefined },
  });
}

/** One product with the details `role` may see, archived or not. */
export function getProductFrom(
  { products, categories, suppliers }: ProductRecords & { suppliers: SnapshotSupplier[] },
  role: Role,
  id: string,
): Result<ProductDetail> {
  if (!can(role, "products.read")) return fail("FORBIDDEN", "You don't have access to that.");
  const product = products.find((p) => p.id === id);
  if (!product) return fail("NOT_FOUND", "That product no longer exists.");
  const showCosts = seesCosts(role);
  const supplier = showCosts ? suppliers.find((s) => s.id === product.supplierId) : undefined;

  return ok({
    ...toListItem(product, categoryNames(categories), showCosts),
    categoryId: product.categoryId,
    expirationDate: product.expirationDate,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
    costs: showCosts
      ? {
          purchasePrice: product.purchasePrice,
          supplierId: supplier?.id ?? null,
          supplierName: supplier?.name ?? null,
        }
      : null,
  });
}

/** Products in use that are Low Stock or Out of Stock, for the menu badge (FR-007, FR-057). */
export function lowStockCountFrom(products: SnapshotProduct[]): number {
  return products.filter((p) => p.archivedAt === null && p.stockQuantity <= p.lowStockThreshold)
    .length;
}
