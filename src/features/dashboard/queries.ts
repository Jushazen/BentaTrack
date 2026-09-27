// Server-side reads: Owner and staff dashboards (FR-023–025; amendment A6 FR-023a, A7 follow-on).
// Leaf 5.2. Staff get today's sales, low stock and recent sales only: no catalogue totals, best
// sellers, purchase prices or profit. Purchase costs are never read for the staff view.
import type { PaymentMethod } from "@/generated/prisma/client";
import { buildSalesReport, type BestSeller } from "@/features/reports/report-math";
import { requireCapability } from "@/lib/auth";
import { periodRange, periodTitle, type DateRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ok, type Result } from "@/lib/result";
import { stockStatus, type StockStatus } from "@/lib/stock-status";

export const LOW_STOCK_LIMIT = 8;
export const RECENT_SALES_LIMIT = 5;
export const NEEDS_COST_LIMIT = 5;
export const DASHBOARD_BEST_SELLERS = 5;

export type TodaySummary = {
  /** "Sunday, 27 September 2026", Manila time. */
  title: string;
  /** Centavos: sales today less refunds given today. */
  netSales: number;
  grossSales: number;
  refunds: number;
  saleCount: number;
  itemsSold: number;
};

export type LowStockItem = {
  id: string;
  name: string;
  code: string;
  quantity: number;
  threshold: number;
  status: StockStatus;
};

export type RecentSale = {
  id: string;
  occurredAt: Date;
  staffName: string;
  /** Centavos. */
  total: number;
  itemCount: number;
  paymentMethod: PaymentMethod;
};

type CommonDashboard = {
  today: TodaySummary;
  /** Low Stock and Out of Stock products, emptiest first. */
  lowStock: { count: number; items: LowStockItem[] };
  recentSales: RecentSale[];
};

export type StaffDashboard = CommonDashboard & { kind: "staff" };

export type OwnerDashboard = CommonDashboard & {
  kind: "owner";
  totalProducts: number;
  /** Units on hand across every product. */
  unitsInStock: number;
  outOfStockCount: number;
  /** Products still waiting for a purchase price (A7 follow-on), so profit leaves them out. */
  needsCost: { count: number; items: { id: string; name: string; code: string }[] };
  /** Best sellers of the current Manila month. */
  bestSellers: { title: string; items: BestSeller[] };
};

export type Dashboard = StaffDashboard | OwnerDashboard;

const lowStockWhere = { stockQuantity: { lte: db.product.fields.lowStockThreshold } };

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
    }),
    db.refund.findMany({
      where: { occurredAt: inRange },
      select: {
        occurredAt: true,
        amount: true,
        sale: { select: { paymentMethod: true } },
        items: { select: { quantity: true, amount: true, saleItem: { select: productRef } } },
      },
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

async function lowStock(): Promise<CommonDashboard["lowStock"]> {
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
  }));
}

/** The signed-in user's dashboard as of `now`: the owner's or the staff one, by role. */
export async function getDashboard(now: Date = new Date()): Promise<Result<Dashboard>> {
  const auth = await requireCapability("dashboard.staff");
  if (!auth.ok) return auth;
  const isOwner = can(auth.data.role, "dashboard.owner");

  const todayRange = periodRange("day", now);
  const [todayFigures, low, recent] = await Promise.all([
    salesFigures(todayRange, false),
    lowStock(),
    recentSales(),
  ]);
  const { totals } = todayFigures;
  const common: CommonDashboard = {
    today: {
      title: periodTitle("day", todayRange),
      netSales: totals.netSales,
      grossSales: totals.grossSales,
      refunds: totals.refunds,
      saleCount: totals.saleCount,
      itemsSold: totals.itemsSold,
    },
    lowStock: low,
    recentSales: recent,
  };
  if (!isOwner) return ok({ kind: "staff", ...common });

  const monthRange = periodRange("month", now);
  const [stock, outOfStockCount, needsCostCount, needsCostRows, monthFigures] = await Promise.all([
    db.product.aggregate({ _count: { _all: true }, _sum: { stockQuantity: true } }),
    db.product.count({ where: { stockQuantity: { lte: 0 } } }),
    db.product.count({ where: { purchasePrice: null } }),
    db.product.findMany({
      where: { purchasePrice: null },
      select: { id: true, name: true, code: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: NEEDS_COST_LIMIT,
    }),
    salesFigures(monthRange, false),
  ]);

  return ok({
    kind: "owner",
    ...common,
    totalProducts: stock._count._all,
    unitsInStock: stock._sum.stockQuantity ?? 0,
    outOfStockCount,
    needsCost: { count: needsCostCount, items: needsCostRows },
    bestSellers: {
      title: periodTitle("month", monthRange),
      items: monthFigures.bestSellers.slice(0, DASHBOARD_BEST_SELLERS),
    },
  });
}
