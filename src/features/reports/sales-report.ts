// A sales report for one period (FR-021, FR-022, FR-047), from the sales and refunds in it. Pure,
// and free of server-only imports, so the server query (./queries.ts) and the offline app
// (src/lib/offline/sales-read.ts, leaf 9.3) build the same report from the same rows.
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
import {
  buildSalesReport,
  type ReportRefund,
  type ReportSale,
  type SalesReportFigures,
} from "./report-math";
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

export type ReportWindow = { period: ReportPeriod; range: DateRange };

/** The period `rawFilters` (usually the page URL) asks for, as of `now`. */
export function reportWindow(rawFilters: unknown, now: Date): ReportWindow {
  const filters = reportFiltersSchema.parse(rawFilters ?? {});
  const anchor = (filters.date && parseManilaDateKey(filters.date)) || now;
  return { period: filters.period, range: periodRange(filters.period, anchor) };
}

/** True when `instant` falls inside `range` (end exclusive), as the database queries filter. */
export function inRange(range: DateRange, instant: Date): boolean {
  return instant >= range.start && instant < range.end;
}

/** The report for `window`, from the sales and refunds that happened in it. */
export function buildPeriodReport(input: {
  window: ReportWindow;
  sales: readonly ReportSale[];
  refunds: readonly ReportRefund[];
  includeProfit: boolean;
  now: Date;
}): SalesReport {
  const { window, now } = input;
  const { period, range } = window;
  const figures = buildSalesReport({
    sales: input.sales,
    refunds: input.refunds,
    buckets: periodBuckets(period, range),
    includeProfit: input.includeProfit,
  });
  return {
    ...figures,
    period,
    dateKey: manilaDateKey(range.start),
    title: periodTitle(period, range),
    range,
    previousKey: manilaDateKey(shiftPeriod(period, range.start, -1)),
    nextKey: range.end > now ? null : manilaDateKey(range.end),
    isCurrent: inRange(range, now),
  };
}
