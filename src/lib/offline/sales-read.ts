// Sales, one sale, the dashboards, and the sales reports read from the device store (FR-049,
// FR-012, FR-021–025, FR-023a, FR-047; leaf 9.3). Same rows, order, and paging as listSales() and
// getSale() in src/features/refunds/queries.ts, and the dashboard and reports are built by the
// same code the server uses (src/features/dashboard/dashboard.ts, src/features/reports/
// sales-report.ts), so for the same data the figures match to the centavo.
//
// Sales and refunds recorded on this device that haven't synced yet are included, marked
// `pending`: they are rebuilt from their outbox entries the way the server will record them
// (the same totals, discount split, and refund amounts). Entries the server refused are left out,
// as the server's figures will never have them; they stay listed under "Waiting to sync" with
// their reason. A refund is only counted if the server would accept it as it stands.
import {
  assembleDashboard,
  dashboardRanges,
  LOW_STOCK_LIMIT,
  NEEDS_COST_LIMIT,
  RECENT_SALES_LIMIT,
  type Dashboard,
  type DashboardParts,
  type RecentSale,
} from "@/features/dashboard/dashboard";
import type { SaleDetail, SaleLine, SalesPage, SaleSummary } from "@/features/refunds/queries";
import { refundAmounts, refundState } from "@/features/refunds/refund-math";
import { refundSaleSchema, SALES_PAGE_SIZE, salesFiltersSchema } from "@/features/refunds/schemas";
import {
  buildSalesReport,
  type ReportRefund,
  type ReportSale,
} from "@/features/reports/report-math";
import {
  buildPeriodReport,
  inRange,
  reportWindow,
  type SalesReport,
} from "@/features/reports/sales-report";
import { saleTotals } from "@/features/sales/cart";
import type { RecordSaleInput } from "@/features/sales/schemas";
import type { Role } from "@/generated/prisma/enums";
import type { DateRange } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";
import { stockStatus } from "@/lib/stock-status";
import { offlineDb, type OfflineDb, type OutboxEntry } from "./db";
import { readEntry, type QueuedCommand } from "./outbox";
import { compareText, containsInsensitive, pageOf } from "./read/compare";
import type { SnapshotProduct, SnapshotRefund, SnapshotSale } from "./snapshot";

const FORBIDDEN = fail("FORBIDDEN", "You don't have access to that.");

export type SalesRecords = {
  products: SnapshotProduct[];
  sales: SnapshotSale[];
  refunds: SnapshotRefund[];
  /** Oldest first, as the outbox sends them. */
  outbox: OutboxEntry[];
};

export type ShopSale = SnapshotSale & { pending: boolean };
export type ShopRefund = SnapshotRefund & { pending: boolean };

/** Every sale and refund the device knows of, synced or not. */
export type ShopSales = {
  sales: ShopSale[];
  refunds: ShopRefund[];
  /** How many of them are waiting to sync. */
  waiting: number;
};

/** Every stored record these reads use, with the outbox, read in one transaction so they agree. */
export async function readSalesRecords(db: OfflineDb = offlineDb()): Promise<SalesRecords> {
  return db.transaction("r", [db.products, db.sales, db.refunds, db.outbox], async () => {
    const [products, sales, refunds, outbox] = await Promise.all([
      db.products.toArray(),
      db.sales.toArray(),
      db.refunds.toArray(),
      db.outbox.orderBy("createdAt").toArray(),
    ]);
    return { products, sales, refunds, outbox };
  });
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** A queued sale as the server will record it, or null if it can't be read. */
function pendingSale(
  entry: QueuedCommand<"SALE">,
  products: Map<string, SnapshotProduct>,
  showCosts: boolean,
): ShopSale | null {
  const input: RecordSaleInput = entry.payload.input;
  const occurredAt = isoOrNull(input.occurredAt);
  if (!occurredAt || !Array.isArray(input.items) || input.items.length === 0) return null;
  const discount = input.discount && input.discount.value > 0 ? input.discount : null;
  const totals = saleTotals(input.items, discount);
  return {
    id: entry.id,
    occurredAt,
    recordedAt: new Date(entry.createdAt).toISOString(),
    staffId: entry.payload.userId,
    staffName: entry.payload.userName,
    customerInfo: input.customerInfo?.trim() || null,
    subtotal: totals.subtotal,
    discountType: discount?.type ?? null,
    discountValue: discount?.value ?? null,
    discountAmount: totals.discountAmount,
    total: totals.total,
    paymentMethod: input.paymentMethod,
    // The server numbers its lines in this order, so they sort the same way here.
    items: input.items.map((item, index) => {
      const product = products.get(item.productId);
      return {
        id: `${entry.id}:${String(index).padStart(2, "0")}`,
        productId: item.productId,
        productName: product?.name ?? "Product",
        productCode: product?.code ?? "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: showCosts ? (product?.purchasePrice ?? null) : null,
        refundedQuantity: 0,
      };
    }),
    pending: true,
  };
}

/**
 * A queued refund as the server will record it, applied to its sale's refunded quantities, or
 * null if the server would refuse it as it stands (unknown sale or line, more than is left, or
 * dated before the sale).
 */
function applyPendingRefund(
  entry: QueuedCommand<"REFUND">,
  sales: Map<string, ShopSale>,
): ShopRefund | null {
  const input = entry.payload.input;
  const sale = sales.get(input.saleId);
  const occurredAt = isoOrNull(input.occurredAt);
  if (!sale || !occurredAt || Date.parse(occurredAt) < Date.parse(sale.occurredAt)) return null;

  const lines: { item: ShopSale["items"][number]; quantity: number; returnToStock: boolean }[] = [];
  for (const line of input.items) {
    const item = sale.items.find((candidate) =>
      line.saleItemId !== undefined
        ? candidate.id === line.saleItemId
        : candidate.productId !== null && candidate.productId === line.productId,
    );
    if (!item || lines.some((seen) => seen.item === item)) return null;
    if (line.quantity > item.quantity - item.refundedQuantity) return null;
    lines.push({
      item,
      quantity: line.quantity,
      returnToStock: (line.returnToStock ?? true) && item.productId !== null,
    });
  }
  if (lines.length === 0) return null;

  const amounts = refundAmounts(
    sale,
    sale.items.map((item) => ({ unitPrice: item.unitPrice, quantity: item.refundedQuantity })),
    lines.map(({ item, quantity }) => ({ unitPrice: item.unitPrice, quantity })),
  );
  for (const { item, quantity } of lines) item.refundedQuantity += quantity;
  return {
    id: entry.id,
    saleId: sale.id,
    occurredAt,
    recordedAt: new Date(entry.createdAt).toISOString(),
    userId: entry.payload.userId,
    userName: entry.payload.userName,
    amount: amounts.reduce((sum, value) => sum + value, 0),
    note: input.note.trim() || null,
    items: lines.map(({ item, quantity, returnToStock }, index) => ({
      id: `${entry.id}:${String(index).padStart(2, "0")}`,
      saleItemId: item.id,
      quantity,
      amount: amounts[index],
      returnedToStock: returnToStock,
    })),
    pending: true,
  };
}

/**
 * The stored sales and refunds plus the ones waiting in the outbox, oldest entry first. A queued
 * entry the device already holds (it synced, but its reply was lost) counts once, as stored.
 */
export function withPending(records: SalesRecords, role: Role): ShopSales {
  const showCosts = can(role, "products.cost");
  const products = new Map(records.products.map((p) => [p.id, p]));
  // Copies, since pending refunds raise their sale lines' refunded quantities.
  const sales = new Map<string, ShopSale>(
    records.sales.map((sale) => [
      sale.id,
      { ...sale, items: sale.items.map((item) => ({ ...item })), pending: false },
    ]),
  );
  const refunds: ShopRefund[] = records.refunds.map((refund) => ({ ...refund, pending: false }));
  const storedRefunds = new Set(records.refunds.map((refund) => refund.id));
  let waiting = 0;

  for (const raw of records.outbox) {
    const entry = readEntry(raw);
    if (!entry || entry.lastError !== null) continue;
    if (entry.kind === "SALE") {
      if (sales.has(entry.id)) continue;
      const sale = pendingSale(entry as QueuedCommand<"SALE">, products, showCosts);
      if (!sale) continue;
      sales.set(sale.id, sale);
      waiting++;
    } else if (entry.kind === "REFUND") {
      if (storedRefunds.has(entry.id)) continue;
      const refund = applyPendingRefund(entry as QueuedCommand<"REFUND">, sales);
      if (!refund) continue;
      refunds.push(refund);
      waiting++;
    }
  }
  return { sales: [...sales.values()], refunds, waiting };
}

const time = (iso: string) => Date.parse(iso);

/** Newest first, as the server lists sales. */
function newestFirst(a: ShopSale, b: ShopSale): number {
  return (
    time(b.occurredAt) - time(a.occurredAt) ||
    time(b.recordedAt) - time(a.recordedAt) ||
    compareText(b.id, a.id)
  );
}

/** Oldest first, as the reports read sales and refunds. */
function oldestFirst(
  a: { id: string; occurredAt: string; recordedAt: string },
  b: { id: string; occurredAt: string; recordedAt: string },
): number {
  return (
    time(a.occurredAt) - time(b.occurredAt) ||
    time(a.recordedAt) - time(b.recordedAt) ||
    compareText(a.id, b.id)
  );
}

function units(items: { quantity: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function refundedBySale(refunds: ShopRefund[]): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const refund of refunds) {
    amounts.set(refund.saleId, (amounts.get(refund.saleId) ?? 0) + refund.amount);
  }
  return amounts;
}

/** Sales, newest first, filtered and paged from the URL's search params. */
export function listSalesFrom(
  shop: ShopSales,
  role: Role,
  rawFilters: unknown = {},
): Result<SalesPage> {
  if (!can(role, "sales.read")) return FORBIDDEN;
  const filters = salesFiltersSchema.parse(rawFilters ?? {});
  const page = filters.page ?? 1;
  const matches = filters.q ? containsInsensitive(filters.q) : null;

  const rows = shop.sales
    .filter(
      (sale) =>
        !matches ||
        (sale.customerInfo !== null && matches(sale.customerInfo)) ||
        sale.items.some((item) => matches(item.productName) || matches(item.productCode)),
    )
    .sort(newestFirst);
  const refunded = refundedBySale(shop.refunds);
  const { items, ...counts } = pageOf(rows, page, SALES_PAGE_SIZE);
  return ok({
    items: items.map((sale): SaleSummary => ({
      id: sale.id,
      occurredAt: new Date(sale.occurredAt),
      staffName: sale.staffName,
      customerInfo: sale.customerInfo,
      total: sale.total,
      refundedAmount: refunded.get(sale.id) ?? 0,
      paymentMethod: sale.paymentMethod,
      itemCount: units(sale.items),
      refundState: refundState(sale.items),
      pending: sale.pending,
    })),
    ...counts,
    filters,
  });
}

/** One sale with its lines and refunds, or NOT_FOUND. */
export function getSaleFrom(shop: ShopSales, role: Role, id: string): Result<SaleDetail> {
  if (!can(role, "sales.read")) return FORBIDDEN;
  const notFound = fail("NOT_FOUND", "This sale doesn't exist.");
  if (!refundSaleSchema.shape.saleId.safeParse(id).success) return notFound;
  const sale = shop.sales.find((candidate) => candidate.id === id);
  if (!sale) return notFound;

  const names = new Map(sale.items.map((item) => [item.id, item.productName]));
  const refunds = shop.refunds.filter((refund) => refund.saleId === id).sort(oldestFirst);
  return ok({
    id: sale.id,
    occurredAt: new Date(sale.occurredAt),
    staffName: sale.staffName,
    customerInfo: sale.customerInfo,
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    total: sale.total,
    refundedAmount: refunds.reduce((sum, refund) => sum + refund.amount, 0),
    paymentMethod: sale.paymentMethod,
    refundState: refundState(sale.items),
    items: [...sale.items]
      .sort((a, b) => compareText(a.productName, b.productName) || compareText(a.id, b.id))
      .map((item): SaleLine => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode,
        quantity: item.quantity,
        refundedQuantity: item.refundedQuantity,
        unitPrice: item.unitPrice,
      })),
    refunds: refunds.map((refund) => ({
      id: refund.id,
      occurredAt: new Date(refund.occurredAt),
      userName: refund.userName,
      amount: refund.amount,
      note: refund.note,
      items: [...refund.items]
        .sort((a, b) => compareText(a.id, b.id))
        .map((item) => ({
          productName: names.get(item.saleItemId) ?? "",
          quantity: item.quantity,
          returnedToStock: item.returnedToStock,
        })),
      pending: refund.pending,
    })),
    pending: sale.pending,
  });
}

/** Sales and refunds that happened in `range`, shaped as the server feeds the report arithmetic. */
function reportRows(
  shop: ShopSales,
  range: DateRange,
  withCosts: boolean,
): { sales: ReportSale[]; refunds: ReportRefund[] } {
  const byId = new Map(shop.sales.map((sale) => [sale.id, sale]));
  const ref = (item: ShopSale["items"][number]) => ({
    productId: item.productId,
    productName: item.productName,
    productCode: item.productCode,
    unitCost: withCosts ? item.unitCost : null,
  });
  const sales = shop.sales
    .filter((sale) => inRange(range, new Date(sale.occurredAt)))
    .sort(oldestFirst)
    .map((sale) => ({
      occurredAt: new Date(sale.occurredAt),
      subtotal: sale.subtotal,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      items: [...sale.items]
        .sort((a, b) => compareText(a.id, b.id))
        .map((item) => ({ ...ref(item), quantity: item.quantity, unitPrice: item.unitPrice })),
    }));
  const refunds = shop.refunds
    .filter((refund) => inRange(range, new Date(refund.occurredAt)) && byId.has(refund.saleId))
    .sort(oldestFirst)
    .map((refund) => {
      const sale = byId.get(refund.saleId)!;
      const lines = new Map(sale.items.map((item) => [item.id, item]));
      return {
        occurredAt: new Date(refund.occurredAt),
        amount: refund.amount,
        paymentMethod: sale.paymentMethod,
        items: [...refund.items]
          .sort((a, b) => compareText(a.id, b.id))
          .flatMap((item) => {
            const line = lines.get(item.saleItemId);
            return line
              ? [{ quantity: item.quantity, amount: item.amount, saleItem: ref(line) }]
              : [];
          }),
      };
    });
  return { sales, refunds };
}

/** The sales report for the period in the URL's search params, as of `now`. Owner only. */
export function salesReportFrom(
  shop: ShopSales,
  role: Role,
  rawFilters: unknown = {},
  now: Date = new Date(),
): Result<SalesReport> {
  if (!can(role, "reports.read")) return FORBIDDEN;
  const window = reportWindow(rawFilters, now);
  const includeProfit = can(role, "products.cost");
  return ok(
    buildPeriodReport({
      window,
      ...reportRows(shop, window.range, includeProfit),
      includeProfit,
      now,
    }),
  );
}

/** The signed-in user's dashboard as of `now`: the owner's or the staff one, by role. */
export function dashboardFrom(
  shop: ShopSales,
  products: SnapshotProduct[],
  role: Role,
  now: Date = new Date(),
): Result<Dashboard> {
  if (!can(role, "dashboard.staff")) return FORBIDDEN;
  const ranges = dashboardRanges(now);
  const figures = (range: DateRange) =>
    buildSalesReport({ ...reportRows(shop, range, false), buckets: [], includeProfit: false });

  // Stock figures cover products in use only (FR-057).
  const inUse = products.filter((p) => p.archivedAt === null);
  const low = inUse
    .filter((p) => p.stockQuantity <= p.lowStockThreshold)
    .sort(
      (a, b) =>
        a.stockQuantity - b.stockQuantity ||
        time(b.updatedAt) - time(a.updatedAt) ||
        compareText(a.id, b.id),
    );
  const parts: DashboardParts = {
    now,
    today: figures(ranges.today),
    lowStock: {
      count: low.length,
      items: low.slice(0, LOW_STOCK_LIMIT).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        quantity: p.stockQuantity,
        threshold: p.lowStockThreshold,
        status: stockStatus(p.stockQuantity, p.lowStockThreshold),
      })),
    },
    recentSales: [...shop.sales]
      .sort(newestFirst)
      .slice(0, RECENT_SALES_LIMIT)
      .map((sale): RecentSale => ({
        id: sale.id,
        occurredAt: new Date(sale.occurredAt),
        staffName: sale.staffName,
        total: sale.total,
        itemCount: units(sale.items),
        paymentMethod: sale.paymentMethod,
        pending: sale.pending,
      })),
  };
  if (!can(role, "dashboard.owner")) return ok(assembleDashboard(parts));

  const needsCost = inUse
    .filter((p) => p.purchasePrice === null)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt) || compareText(a.id, b.id));
  return ok(
    assembleDashboard({
      ...parts,
      owner: {
        totalProducts: inUse.length,
        unitsInStock: inUse.reduce((sum, p) => sum + p.stockQuantity, 0),
        outOfStockCount: inUse.filter((p) => p.stockQuantity <= 0).length,
        needsCost: {
          count: needsCost.length,
          items: needsCost
            .slice(0, NEEDS_COST_LIMIT)
            .map((p) => ({ id: p.id, name: p.name, code: p.code })),
        },
        month: figures(ranges.month),
      },
    }),
  );
}
