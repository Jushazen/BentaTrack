// Server-side reads: Sales reports (FR-021, FR-022, FR-047). Leaf 5.1. Owner only: staff are
// refused (FR-032). Gross profit also needs the cost capability, which only the owner has.
import { requireCapability } from "@/lib/auth";
import {
  manilaDateKey,
  parseManilaDateKey,
  periodBuckets,
  periodRange,
  periodTitle,
  shiftPeriod,
  type DateRange,
  type ReportPeriod,
} from "@/lib/dates";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ok, type Result } from "@/lib/result";
import { buildSalesReport, type SalesReportFigures } from "./report-math";
import { reportFiltersSchema } from "./schemas";

export type SalesReport = SalesReportFigures & {
  period: ReportPeriod;
  /** A Manila date inside the period, "2026-09-27". */
  dateKey: string;
  title: string;
  range: DateRange;
  /** Date keys of the neighbouring periods; `nextKey` is null for the current period. */
  previousKey: string;
  nextKey: string | null;
  isCurrent: boolean;
};

const productRef = { productId: true, productName: true, productCode: true, unitCost: true };

/** The report for the period in `rawFilters` (usually the page URL), as of `now`. */
export async function getSalesReport(
  rawFilters: unknown = {},
  now: Date = new Date(),
): Promise<Result<SalesReport>> {
  const auth = await requireCapability("reports.read");
  if (!auth.ok) return auth;
  const filters = reportFiltersSchema.parse(rawFilters ?? {});
  const anchor = (filters.date && parseManilaDateKey(filters.date)) || now;
  const { period } = filters;
  const range = periodRange(period, anchor);
  const inRange = { gte: range.start, lt: range.end };

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

  const figures = buildSalesReport({
    sales,
    refunds: refunds.map(({ sale, ...refund }) => ({
      ...refund,
      paymentMethod: sale.paymentMethod,
    })),
    buckets: periodBuckets(period, range),
    includeProfit: can(auth.data.role, "products.cost"),
  });

  const isCurrent = now >= range.start && now < range.end;
  return ok({
    ...figures,
    period,
    dateKey: manilaDateKey(range.start),
    title: periodTitle(period, range),
    range,
    previousKey: manilaDateKey(shiftPeriod(period, range.start, -1)),
    nextKey: range.end > now ? null : manilaDateKey(range.end),
    isCurrent,
  });
}
