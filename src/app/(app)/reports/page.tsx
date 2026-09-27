// Sales reports (FR-021, FR-022, FR-047). Leaf 5.1. Owner only. Periods are in Philippine time
// and weeks run Monday to Sunday; refunds count on the day they were given. No export (FR-048).
import {
  ArrowRight,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PesoBarChart } from "@/components/charts/bar-chart";
import { buttonClasses } from "@/components/ui/button";
import { getSalesReport, type SalesReport } from "@/features/reports/queries";
import { PERIOD_LABEL } from "@/features/reports/schemas";
import { PAYMENT_LABEL } from "@/features/sales/schemas";
import { requirePageCapability } from "@/lib/auth";
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata: Metadata = { title: "Reports · BentaTrack" };

const PERIOD_ICON: Record<ReportPeriod, LucideIcon> = {
  day: CalendarDays,
  week: CalendarRange,
  month: Calendar,
  year: CalendarCheck,
};

const CURRENT_LABEL: Record<ReportPeriod, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
};

const BUCKET_NAME: Record<ReportPeriod, { title: string; column: string }> = {
  day: { title: "Net sales by hour", column: "Hour" },
  week: { title: "Net sales by day", column: "Day" },
  month: { title: "Net sales by day", column: "Day" },
  year: { title: "Net sales by month", column: "Month" },
};

// Same look as inputClasses in components/ui/field.tsx (a "use client" module; see product-list).
const inputClasses = "border-border bg-bg text-text w-full rounded-lg border px-3 py-2.5 text-base";

function reportHref(period: ReportPeriod, date?: string): string {
  const params = new URLSearchParams({ period });
  if (date) params.set("date", date);
  return `/reports?${params.toString()}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function PeriodTabs({ report }: { report: SalesReport }) {
  return (
    <nav
      aria-label="Report period"
      className="bg-surface grid grid-cols-2 gap-1 rounded-lg p-1 sm:grid-cols-4"
    >
      {REPORT_PERIODS.map((period) => {
        const Icon = PERIOD_ICON[period];
        const current = period === report.period;
        return (
          <Link
            key={period}
            href={reportHref(period, report.isCurrent ? undefined : report.dateKey)}
            aria-current={current ? "page" : undefined}
            className={buttonClasses(current ? "primary" : "ghost", "px-3")}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            <span>{PERIOD_LABEL[period]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PeriodNavigator({ report }: { report: SalesReport }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={reportHref(report.period, report.previousKey)}
          className={buttonClasses("secondary", "px-3")}
        >
          <ChevronLeft aria-hidden className="size-4 shrink-0" />
          <span>Previous</span>
        </Link>
        <h2 className="text-text order-first w-full text-center text-lg font-semibold sm:order-none sm:w-auto">
          {report.title}
        </h2>
        {report.nextKey ? (
          <Link
            href={reportHref(report.period, report.nextKey)}
            className={buttonClasses("secondary", "px-3")}
          >
            <span>Next</span>
            <ChevronRight aria-hidden className="size-4 shrink-0" />
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonClasses("secondary", "px-3 opacity-60")}>
            <span>Next</span>
            <ChevronRight aria-hidden className="size-4 shrink-0" />
          </span>
        )}
      </div>
      <form
        method="get"
        action="/reports"
        aria-label="Choose a date"
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="period" value={report.period} />
        <div className="min-w-44 flex-1 space-y-1.5 sm:flex-none">
          <label htmlFor="report-date" className="text-text block text-sm font-medium">
            Show the {PERIOD_LABEL[report.period].toLowerCase()} report for
          </label>
          <input
            id="report-date"
            name="date"
            type="date"
            defaultValue={report.dateKey}
            required
            className={inputClasses}
          />
        </div>
        <button type="submit" className={buttonClasses("secondary")}>
          <ArrowRight aria-hidden className="size-4 shrink-0" />
          <span>Show</span>
        </button>
        {!report.isCurrent && (
          <Link href={reportHref(report.period)} className={buttonClasses("ghost")}>
            <CalendarCheck aria-hidden className="size-4 shrink-0" />
            <span>{CURRENT_LABEL[report.period]}</span>
          </Link>
        )}
      </form>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="bg-surface rounded-lg p-4">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="text-text mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-muted mt-1 text-sm">{note}</dd>}
    </div>
  );
}

function Totals({ report }: { report: SalesReport }) {
  const { totals, profit } = report;
  return (
    <dl aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Net sales" value={formatPeso(totals.netSales)} note="Sales less refunds given" />
      <Stat
        label="Sales"
        value={formatPeso(totals.grossSales)}
        note={plural(totals.saleCount, "sale")}
      />
      <Stat
        label="Refunds"
        value={formatPeso(totals.refunds)}
        note={plural(totals.refundCount, "refund")}
      />
      <Stat
        label="Items sold"
        value={String(totals.itemsSold)}
        note={totals.itemsRefunded > 0 ? `${totals.itemsRefunded} returned` : undefined}
      />
      <Stat label="Discounts given" value={formatPeso(totals.discounts)} />
      {report.byPayment.map((row) => (
        <Stat
          key={row.method}
          label={`${PAYMENT_LABEL[row.method]} (net)`}
          value={formatPeso(row.net)}
        />
      ))}
      {profit && (
        <Stat
          label="Gross profit"
          value={formatPeso(profit.amount)}
          note={
            profit.excludedUnits > 0
              ? `${plural(profit.excludedUnits, "item")} without a purchase price not counted`
              : "Selling price less purchase price"
          }
        />
      )}
    </dl>
  );
}

function BestSellers({ report }: { report: SalesReport }) {
  return (
    <section aria-labelledby="best-sellers" className="bg-surface space-y-3 rounded-lg p-4">
      <h2 id="best-sellers" className="text-text font-medium">
        Best sellers
      </h2>
      {report.bestSellers.length === 0 ? (
        <p className="text-muted">Nothing sold in this period.</p>
      ) : (
        <ol aria-label="Best sellers" className="divide-border divide-y">
          {report.bestSellers.map((item, i) => (
            <li
              key={item.productId ?? `code:${item.code}`}
              className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-3 py-2.5"
            >
              <span className="text-muted tabular-nums">{i + 1}.</span>
              <span className="min-w-0">
                {item.productId ? (
                  <Link href={`/products/${item.productId}`} className="text-link font-medium">
                    {item.name}
                  </Link>
                ) : (
                  <span className="text-text font-medium">{item.name}</span>
                )}
                <span className="text-muted block text-sm">{item.code}</span>
              </span>
              <span className="text-right">
                <span className="text-text block font-medium tabular-nums">
                  {plural(item.units, "sold", "sold")}
                </span>
                <span className="text-muted block text-sm tabular-nums">
                  {formatPeso(item.revenue)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requirePageCapability("reports.read");
  const result = await getSalesReport(await searchParams);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-text">Sales reports</h1>
        <p className="text-muted mt-1">
          Philippine time. Weeks run Monday to Sunday. Refunds count on the day they were given.
        </p>
      </div>
      {result.ok ? (
        <>
          <PeriodTabs report={result.data} />
          <PeriodNavigator report={result.data} />
          <Totals report={result.data} />
          <div className="bg-surface rounded-lg p-4">
            <PesoBarChart
              title={BUCKET_NAME[result.data.period].title}
              categoryLabel={BUCKET_NAME[result.data.period].column}
              labels={result.data.buckets.map((bucket) => bucket.label)}
              values={result.data.buckets.map((bucket) => bucket.netSales)}
            />
          </div>
          <BestSellers report={result.data} />
        </>
      ) : (
        <p role="alert" className="text-danger">
          {result.error.message}
        </p>
      )}
    </div>
  );
}
