// Server-side reads: Owner and staff dashboards (FR-023–025; amendment A6 FR-023a, A7 follow-on).
// Leaf 5.2. Staff get today's sales, low stock and recent sales only: no catalogue totals, best
// sellers, purchase prices or profit. Purchase costs are never read for the staff view.
// The dashboard is put together by ./dashboard.ts, which the offline app uses too (leaf 9.3).
import { buildSalesReport } from "@/features/reports/report-math";
import { requireCapability } from "@/lib/auth";
import type { DateRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ok, type Result } from "@/lib/result";
import { stockStatus } from "@/lib/stock-status";
import {
  assembleDashboard,
  dashboardRanges,
  LOW_STOCK_LIMIT,
  NEEDS_COST_LIMIT,
  RECENT_SALES_LIMIT,
  type Dashboard,
  type DashboardParts,
  type RecentSale,
} from "./dashboard";

export * from "./dashboard";

// Stock figures cover products in use only; archived ones are left out (FR-057).
const inUse = { archivedAt: null };
const lowStockWhere = {
  ...inUse,
  stockQuantity: { lte: db.product.fields.lowStockThreshold },
};

/** Oldest first, as the reports read them (see src/features/reports/queries.ts). */
const reportOrder = [
  { occurredAt: "asc" as const },
  { recordedAt: "asc" as const },
  { id: "asc" as const },
];

/** Sales and refunds in `range`, shaped for the report arithmetic. Costs only when asked. */
async function salesFigures(range: DateRange, withCosts: boolean) {
  const inRange = { gte: range.start, lt: range.end };
  const productRef = {
    productId: true,
    productName: true,
    productCode: true,
    unitCost: withCosts,
  } as const;
  const [sales, refunds] = await Promise.all([
    db.sale.findMany({
      where: { occurredAt: inRange },
      select: {
        occurredAt: true,
        subtotal: true,
        total: true,
        paymentMethod: true,
        items: {
          select: { ...productRef, quantity: true, unitPrice: true },
          orderBy: { id: "asc" },
        },
      },
      orderBy: reportOrder,
    }),
    db.refund.findMany({
      where: { occurredAt: inRange },
      select: {
        occurredAt: true,
        amount: true,
        sale: { select: { paymentMethod: true } },
        items: {
          select: { quantity: true, amount: true, saleItem: { select: productRef } },
          orderBy: { id: "asc" },
        },
      },
      orderBy: reportOrder,
    }),
  ]);
  return buildSalesReport({
    sales: sales.map((sale) => ({
      ...sale,
      items: sale.items.map((item) => ({ ...item, unitCost: item.unitCost ?? null })),
    })),
    refunds: refunds.map(({ sale, ...refund }) => ({
      ...refund,
      paymentMethod: sale.paymentMethod,
      items: refund.items.map((item) => ({
        ...item,
        saleItem: { ...item.saleItem, unitCost: item.saleItem.unitCost ?? null },
      })),
    })),
    buckets: [],
    includeProfit: false,
  });
}

async function lowStock(): Promise<DashboardParts["lowStock"]> {
  const [count, rows] = await Promise.all([
    db.product.count({ where: lowStockWhere }),
    db.product.findMany({
      where: lowStockWhere,
      select: { id: true, name: true, code: true, stockQuantity: true, lowStockThreshold: true },
      // Emptiest first; among equals, the one that changed most recently.
      orderBy: [{ stockQuantity: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
      take: LOW_STOCK_LIMIT,
    }),
  ]);
  return {
    count,
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      quantity: row.stockQuantity,
      threshold: row.lowStockThreshold,
      status: stockStatus(row.stockQuantity, row.lowStockThreshold),
    })),
  };
}

async function recentSales(): Promise<RecentSale[]> {
  const rows = await db.sale.findMany({
    select: {
      id: true,
      occurredAt: true,
      total: true,
      paymentMethod: true,
      staff: { select: { name: true } },
      items: { select: { quantity: true } },
    },
    orderBy: [{ occurredAt: "desc" }, { recordedAt: "desc" }, { id: "desc" }],
    take: RECENT_SALES_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    staffName: row.staff.name,
    total: row.total,
    itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
    paymentMethod: row.paymentMethod,
    pending: false,
  }));
}

/** The signed-in user's dashboard as of `now`: the owner's or the staff one, by role. */
export async function getDashboard(now: Date = new Date()): Promise<Result<Dashboard>> {
  const auth = await requireCapability("dashboard.staff");
  if (!auth.ok) return auth;
  const isOwner = can(auth.data.role, "dashboard.owner");

  const ranges = dashboardRanges(now);
  const [today, low, recent] = await Promise.all([
    salesFigures(ranges.today, false),
    lowStock(),
    recentSales(),
  ]);
  const parts: DashboardParts = { now, today, lowStock: low, recentSales: recent };
  if (!isOwner) return ok(assembleDashboard(parts));

  const [stock, outOfStockCount, needsCostCount, needsCostRows, month] = await Promise.all([
    db.product.aggregate({
      where: inUse,
      _count: { _all: true },
      _sum: { stockQuantity: true },
    }),
    db.product.count({ where: { ...inUse, stockQuantity: { lte: 0 } } }),
    db.product.count({ where: { ...inUse, purchasePrice: null } }),
    db.product.findMany({
      where: { ...inUse, purchasePrice: null },
      select: { id: true, name: true, code: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: NEEDS_COST_LIMIT,
    }),
    salesFigures(ranges.month, false),
  ]);

  return ok(
    assembleDashboard({
      ...parts,
      owner: {
        totalProducts: stock._count._all,
        unitsInStock: stock._sum.stockQuantity ?? 0,
        outOfStockCount,
        needsCost: { count: needsCostCount, items: needsCostRows },
        month,
      },
    }),
  );
}
