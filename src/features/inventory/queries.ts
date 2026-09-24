// Server-side reads: Inventory history (FR-010–012). Leaf 3.4.
// Rows keep the product's name and code as they were at the time (A2), so history for a deleted
// product still reads correctly, and the name/code search runs on those snapshots.
import type { InventoryChangeType, Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, type Result } from "@/lib/result";
import { historyFiltersSchema, type HistoryFilters } from "./schemas";

export const HISTORY_PAGE_SIZE = 50;

export type HistoryEntry = {
  id: string;
  occurredAt: Date;
  type: InventoryChangeType;
  quantityChange: number;
  stockAfter: number;
  /** Null once the product has been deleted. */
  productId: string | null;
  productName: string;
  productCode: string;
  userName: string;
  note: string | null;
};

export type HistoryPage = {
  items: HistoryEntry[];
  total: number;
  page: number;
  pageCount: number;
  filters: HistoryFilters;
  /** Name and code of the product the list is limited to, when `filters.product` is set. */
  productLabel: { name: string; code: string } | null;
};

/** Inventory history, newest first. `rawFilters` usually comes from the page's URL. */
export async function listInventoryChanges(rawFilters: unknown = {}): Promise<Result<HistoryPage>> {
  const auth = await requireCapability("inventory.history");
  if (!auth.ok) return auth;
  const filters = historyFiltersSchema.parse(rawFilters ?? {});
  const page = filters.page ?? 1;

  const where: Prisma.InventoryChangeWhereInput[] = [];
  if (filters.product) where.push({ productId: filters.product });
  if (filters.type) where.push({ type: filters.type });
  if (filters.q) {
    where.push({
      OR: [
        { productName: { contains: filters.q, mode: "insensitive" } },
        { productCode: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  const [total, rows, product] = await Promise.all([
    db.inventoryChange.count({ where: { AND: where } }),
    db.inventoryChange.findMany({
      where: { AND: where },
      select: {
        id: true,
        occurredAt: true,
        type: true,
        quantityChange: true,
        stockAfter: true,
        productId: true,
        productName: true,
        productCode: true,
        note: true,
        user: { select: { name: true } },
      },
      // recordedAt and id break ties so paging is stable when two changes share a time.
      orderBy: [{ occurredAt: "desc" }, { recordedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * HISTORY_PAGE_SIZE,
      take: HISTORY_PAGE_SIZE,
    }),
    filters.product
      ? db.product.findUnique({
          where: { id: filters.product },
          select: { name: true, code: true },
        })
      : null,
  ]);

  return ok({
    items: rows.map(({ user, ...row }) => ({ ...row, userName: user.name })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
    filters,
    productLabel: product,
  });
}
