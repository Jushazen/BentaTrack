// What the dashboards show (FR-023–025, FR-023a) and how their figures are put together. Pure, and
// free of server-only imports, so the server query (./queries.ts) and the offline app
// (src/lib/offline/sales-read.ts, leaf 9.3) build the same dashboard from the same rows: sales
// figures come from the report arithmetic, the rest from the parts passed in.
import type { PaymentMethod } from "@/generated/prisma/enums";
import type { BestSeller, SalesReportFigures } from "@/features/reports/report-math";
import { periodRange, periodTitle, type DateRange } from "@/lib/dates";
import type { StockStatus } from "@/lib/stock-status";

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
  /** Recorded on this device and not yet synced (offline only). */
  pending: boolean;
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

/** Today and this month in Manila time, as of `now`. */
export function dashboardRanges(now: Date): { today: DateRange; month: DateRange } {
  return { today: periodRange("day", now), month: periodRange("month", now) };
}

export type DashboardParts = {
  now: Date;
  /** Sales figures for today (see dashboardRanges). */
  today: SalesReportFigures;
  lowStock: CommonDashboard["lowStock"];
  recentSales: RecentSale[];
  /** Only for the owner's dashboard. */
  owner?: {
    totalProducts: number;
    unitsInStock: number;
    outOfStockCount: number;
    needsCost: OwnerDashboard["needsCost"];
    /** Sales figures for this month. */
    month: SalesReportFigures;
  };
};

/** The owner's dashboard when `owner` parts are given, else the staff one. */
export function assembleDashboard(parts: DashboardParts): Dashboard {
  const ranges = dashboardRanges(parts.now);
  const { totals } = parts.today;
  const common: CommonDashboard = {
    today: {
      title: periodTitle("day", ranges.today),
      netSales: totals.netSales,
      grossSales: totals.grossSales,
      refunds: totals.refunds,
      saleCount: totals.saleCount,
      itemsSold: totals.itemsSold,
    },
    lowStock: parts.lowStock,
    recentSales: parts.recentSales,
  };
  if (!parts.owner) return { kind: "staff", ...common };
  const { month, ...owner } = parts.owner;
  return {
    kind: "owner",
    ...common,
    ...owner,
    bestSellers: {
      title: periodTitle("month", ranges.month),
      items: month.bestSellers.slice(0, DASHBOARD_BEST_SELLERS),
    },
  };
}
