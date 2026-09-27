// Report periods in Philippine time (FR-021, amendment B7): days, weeks (Monday to Sunday),
// months and years all start at midnight in Asia/Manila. Times are stored as UTC instants; these
// helpers turn a period into the UTC range [start, end) that covers it.
import { tz } from "@date-fns/tz";
import {
  addDays,
  addHours,
  addMonths,
  addWeeks,
  addYears,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";

export const REPORT_TIME_ZONE = "Asia/Manila";

export const REPORT_PERIODS = ["day", "week", "month", "year"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** UTC instants; `end` is exclusive. */
export type DateRange = { start: Date; end: Date };

export type Bucket = DateRange & { label: string };

const inManila = tz(REPORT_TIME_ZONE);
const DATE_KEY = "yyyy-MM-dd";

/** The Manila calendar date of an instant, as "2026-09-27". */
export function manilaDateKey(instant: Date): string {
  return format(instant, DATE_KEY, { in: inManila });
}

/** Midnight in Manila on the given "2026-09-27" date, or null if it isn't a real date. */
export function parseManilaDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const parsed = parse(key, DATE_KEY, new Date(0), { in: inManila });
  if (!isValid(parsed) || manilaDateKey(parsed) !== key) return null;
  return new Date(parsed.getTime());
}

function periodStart(period: ReportPeriod, anchor: Date): Date {
  const options = { in: inManila };
  switch (period) {
    case "day":
      return startOfDay(anchor, options);
    case "week":
      return startOfWeek(anchor, { ...options, weekStartsOn: 1 });
    case "month":
      return startOfMonth(anchor, options);
    case "year":
      return startOfYear(anchor, options);
  }
}

/** Moves `date` by `steps` whole periods, in Manila time. */
export function shiftPeriod(period: ReportPeriod, date: Date, steps: number): Date {
  const options = { in: inManila };
  switch (period) {
    case "day":
      return new Date(addDays(date, steps, options).getTime());
    case "week":
      return new Date(addWeeks(date, steps, options).getTime());
    case "month":
      return new Date(addMonths(date, steps, options).getTime());
    case "year":
      return new Date(addYears(date, steps, options).getTime());
  }
}

/** The Manila day, Monday-start week, month or year containing `anchor`. */
export function periodRange(period: ReportPeriod, anchor: Date): DateRange {
  const start = periodStart(period, anchor);
  return {
    start: new Date(start.getTime()),
    end: new Date(periodStart(period, shiftPeriod(period, start, 1)).getTime()),
  };
}

/**
 * Chart buckets for a period: hours of a day, days of a week or month, months of a year.
 * Labels are short and in Manila time ("9 AM", "Mon 21", "21", "Sep").
 */
export function periodBuckets(period: ReportPeriod, range: DateRange): Bucket[] {
  const step = (date: Date) =>
    period === "day"
      ? addHours(date, 1, { in: inManila })
      : period === "year"
        ? addMonths(date, 1, { in: inManila })
        : addDays(date, 1, { in: inManila });
  const pattern =
    period === "day" ? "h a" : period === "week" ? "EEE d" : period === "month" ? "d" : "MMM";

  const buckets: Bucket[] = [];
  for (let start = range.start; start < range.end;) {
    const end = new Date(step(start).getTime());
    buckets.push({ start, end, label: format(start, pattern, { in: inManila }) });
    start = end;
  }
  return buckets;
}

/** How a period is named on screen: "Sunday, 27 September 2026", "21–27 September 2026", … */
export function periodTitle(period: ReportPeriod, range: DateRange): string {
  const options = { in: inManila };
  switch (period) {
    case "day":
      return format(range.start, "EEEE, d MMMM yyyy", options);
    case "week": {
      const last = new Date(addDays(range.end, -1, options).getTime());
      const sameMonth =
        format(range.start, "yyyy-MM", options) === format(last, "yyyy-MM", options);
      const sameYear = format(range.start, "yyyy", options) === format(last, "yyyy", options);
      const first = format(
        range.start,
        sameMonth ? "d" : sameYear ? "d MMMM" : "d MMMM yyyy",
        options,
      );
      return `${first}–${format(last, "d MMMM yyyy", options)}`;
    }
    case "month":
      return format(range.start, "MMMM yyyy", options);
    case "year":
      return format(range.start, "yyyy", options);
  }
}
