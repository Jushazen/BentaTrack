// Server-side reads: Product records (FR-001–006, FR-037). Leaf 3.2.
// Staff never receive purchase prices or supplier details (FR-032, FR-042): those fields are
// left out of the query itself, not just hidden in the UI.
import type { Prisma } from "@/generated/prisma/client";
import { requireCapability, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ok, fail, type Result } from "@/lib/result";
import { stockStatus, type StockStatus } from "@/lib/stock-status";
import { productFiltersSchema, type ProductFilters } from "./schemas";

export const PRODUCT_PAGE_SIZE = 50;

export type ProductListItem = {
  id: string;
  name: string;
  code: string;
  barcode: string | null;
  brand: string | null;
  categoryName: string;
  sellingPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  status: StockStatus;
  imageUrl: string | null;
  /** Owner only: no purchase price yet (A7 follow-on). Always false for staff. */
  needsCost: boolean;
};

export type ProductPage = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageCount: number;
  filters: ProductFilters;
};

/** Owner-only details. Null for staff, so nothing about cost or supplier reaches them. */
export type ProductCosts = {
  purchasePrice: number | null;
  supplierId: string | null;
  supplierName: string | null;
};

export type ProductDetail = Omit<ProductListItem, "categoryName"> & {
  categoryId: string;
  categoryName: string;
  expirationDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  costs: ProductCosts | null;
};

const listSelect = {
  id: true,
  name: true,
  code: true,
  barcode: true,
  brand: true,
  sellingPrice: true,
  stockQuantity: true,
  lowStockThreshold: true,
  imageUrl: true,
  category: { select: { name: true } },
} as const satisfies Prisma.ProductSelect;

function seesCosts(user: SessionUser): boolean {
  return can(user.role, "products.cost") && can(user.role, "suppliers.read");
}

function toListItem(
  row: Prisma.ProductGetPayload<{ select: typeof listSelect }> & { purchasePrice?: number | null },
  showCosts: boolean,
): ProductListItem {
  const { category, purchasePrice, ...rest } = row;
  return {
    ...rest,
    categoryName: category.name,
    status: stockStatus(row.stockQuantity, row.lowStockThreshold),
    needsCost: showCosts && purchasePrice === null,
  };
}

/** Product list with search and filters. `rawFilters` usually comes from the page's URL. */
export async function listProducts(rawFilters: unknown = {}): Promise<Result<ProductPage>> {
  const auth = await requireCapability("products.read");
  if (!auth.ok) return auth;
  const showCosts = seesCosts(auth.data);
  const filters = productFiltersSchema.parse(rawFilters ?? {});
  const page = filters.page ?? 1;

  const where: Prisma.ProductWhereInput[] = [];
  if (filters.q) {
    where.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { code: { contains: filters.q, mode: "insensitive" } },
        { barcode: filters.q },
      ],
    });
  }
  if (filters.category) where.push({ categoryId: filters.category });
  if (filters.stock === "low") {
    where.push({ stockQuantity: { lte: db.product.fields.lowStockThreshold } });
  }
  if (filters.stock === "out") where.push({ stockQuantity: 0 });
  if (filters.cost === "missing" && showCosts) where.push({ purchasePrice: null });

  const [total, rows] = await db.$transaction([
    db.product.count({ where: { AND: where } }),
    db.product.findMany({
      where: { AND: where },
      select: { ...listSelect, purchasePrice: showCosts },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      skip: (page - 1) * PRODUCT_PAGE_SIZE,
      take: PRODUCT_PAGE_SIZE,
    }),
  ]);

  return ok({
    items: rows.map((row) => toListItem(row, showCosts)),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE)),
    filters,
  });
}

export async function getProduct(id: string): Promise<Result<ProductDetail>> {
  const auth = await requireCapability("products.read");
  if (!auth.ok) return auth;
  const showCosts = seesCosts(auth.data);

  const row = await db.product.findUnique({
    where: { id },
    select: {
      ...listSelect,
      categoryId: true,
      expirationDate: true,
      createdAt: true,
      updatedAt: true,
      purchasePrice: showCosts,
      supplier: showCosts ? { select: { id: true, name: true } } : false,
    },
  });
  if (!row) return fail("NOT_FOUND", "That product no longer exists.");

  const { supplier, expirationDate, ...rest } = row;
  return ok({
    ...toListItem(rest, showCosts),
    categoryId: row.categoryId,
    expirationDate: expirationDate ? expirationDate.toISOString().slice(0, 10) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    costs: showCosts
      ? {
          purchasePrice: row.purchasePrice ?? null,
          supplierId: supplier?.id ?? null,
          supplierName: supplier?.name ?? null,
        }
      : null,
  });
}
