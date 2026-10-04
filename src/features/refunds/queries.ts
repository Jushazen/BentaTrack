// Server-side reads: Sales history and refunds (FR-012, FR-039, FR-040). Leaf 4.2. Offline, the
// same pages read the device store through src/lib/offline/sales-read.ts (leaf 9.3).
// Staff and owner both see every sale, since either may handle a return. Purchase costs are never
// read here: they're owner-only (FR-042) and a refund doesn't need them.
import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, ok, type Result } from "@/lib/result";
import { refundState, type RefundState } from "./refund-math";
import {
  refundSaleSchema,
  SALES_PAGE_SIZE,
  salesFiltersSchema,
  type SalesFilters,
} from "./schemas";

export { SALES_PAGE_SIZE };

export type { RefundState };

export type SaleSummary = {
  id: string;
  occurredAt: Date;
  staffName: string;
  customerInfo: string | null;
  /** Centavos. */
  total: number;
  /** Centavos returned so far. */
  refundedAmount: number;
  paymentMethod: PaymentMethod;
  itemCount: number;
  refundState: RefundState;
  /** Recorded on this device and not yet synced (offline only; always false here). */
  pending: boolean;
};

export type SalesPage = {
  items: SaleSummary[];
  total: number;
  page: number;
  pageCount: number;
  filters: SalesFilters;
};

/** Sales, newest first. `rawFilters` usually comes from the page's URL. */
export async function listSales(rawFilters: unknown = {}): Promise<Result<SalesPage>> {
  const auth = await requireCapability("sales.read");
  if (!auth.ok) return auth;
  const filters = salesFiltersSchema.parse(rawFilters ?? {});
  const page = filters.page ?? 1;

  const where: Prisma.SaleWhereInput = filters.q
    ? {
        OR: [
          { customerInfo: { contains: filters.q, mode: "insensitive" } },
          {
            items: {
              some: {
                OR: [
                  { productName: { contains: filters.q, mode: "insensitive" } },
                  { productCode: { contains: filters.q, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      }
    : {};

  const [total, rows] = await Promise.all([
    db.sale.count({ where }),
    db.sale.findMany({
      where,
      select: {
        id: true,
        occurredAt: true,
        customerInfo: true,
        total: true,
        paymentMethod: true,
        staff: { select: { name: true } },
        items: { select: { quantity: true, refundedQuantity: true } },
        refunds: { select: { amount: true } },
      },
      // recordedAt and id break ties so paging is stable when two sales share a time.
      orderBy: [{ occurredAt: "desc" }, { recordedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * SALES_PAGE_SIZE,
      take: SALES_PAGE_SIZE,
    }),
  ]);

  return ok({
    items: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      staffName: row.staff.name,
      customerInfo: row.customerInfo,
      total: row.total,
      refundedAmount: row.refunds.reduce((sum, refund) => sum + refund.amount, 0),
      paymentMethod: row.paymentMethod,
      itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
      refundState: refundState(row.items),
      pending: false,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / SALES_PAGE_SIZE)),
    filters,
  });
}

export type SaleLine = {
  id: string;
  /** Null once the product has been deleted: a refund then returns money but no stock. */
  productId: string | null;
  productName: string;
  productCode: string;
  quantity: number;
  refundedQuantity: number;
  /** Centavos. */
  unitPrice: number;
};

export type SaleRefund = {
  id: string;
  occurredAt: Date;
  userName: string;
  /** Centavos. */
  amount: number;
  note: string | null;
  /** `returnedToStock` is false for units kept out of stock, e.g. damaged (H4.2). */
  items: { productName: string; quantity: number; returnedToStock: boolean }[];
  /** Recorded on this device and not yet synced (offline only). */
  pending: boolean;
};

export type SaleDetail = {
  id: string;
  occurredAt: Date;
  staffName: string;
  customerInfo: string | null;
  /** Centavos. */
  subtotal: number;
  discountAmount: number;
  total: number;
  refundedAmount: number;
  paymentMethod: PaymentMethod;
  refundState: RefundState;
  items: SaleLine[];
  /** Oldest first. */
  refunds: SaleRefund[];
  /** Recorded on this device and not yet synced (offline only). */
  pending: boolean;
};

/** One sale with its lines and refunds, or NOT_FOUND. */
export async function getSale(id: string): Promise<Result<SaleDetail>> {
  const auth = await requireCapability("sales.read");
  if (!auth.ok) return auth;
  // Sale ids are UUIDs; anything else can't match (and would make the uuid column query fail).
  if (!refundSaleSchema.shape.saleId.safeParse(id).success) {
    return fail("NOT_FOUND", "This sale doesn't exist.");
  }

  const sale = await db.sale.findUnique({
    where: { id },
    select: {
      id: true,
      occurredAt: true,
      customerInfo: true,
      subtotal: true,
      discountAmount: true,
      total: true,
      paymentMethod: true,
      staff: { select: { name: true } },
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          productCode: true,
          quantity: true,
          refundedQuantity: true,
          unitPrice: true,
        },
        orderBy: [{ productName: "asc" }, { id: "asc" }],
      },
      refunds: {
        select: {
          id: true,
          occurredAt: true,
          amount: true,
          note: true,
          user: { select: { name: true } },
          items: {
            select: {
              quantity: true,
              returnedToStock: true,
              saleItem: { select: { productName: true } },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: [{ occurredAt: "asc" }, { recordedAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!sale) return fail("NOT_FOUND", "This sale doesn't exist.");

  return ok({
    id: sale.id,
    occurredAt: sale.occurredAt,
    staffName: sale.staff.name,
    customerInfo: sale.customerInfo,
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    total: sale.total,
    refundedAmount: sale.refunds.reduce((sum, refund) => sum + refund.amount, 0),
    paymentMethod: sale.paymentMethod,
    refundState: refundState(sale.items),
    items: sale.items,
    refunds: sale.refunds.map((refund) => ({
      id: refund.id,
      occurredAt: refund.occurredAt,
      userName: refund.user.name,
      amount: refund.amount,
      note: refund.note,
      items: refund.items.map((item) => ({
        productName: item.saleItem.productName,
        quantity: item.quantity,
        returnedToStock: item.returnedToStock,
      })),
      pending: false,
    })),
    pending: false,
  });
}
