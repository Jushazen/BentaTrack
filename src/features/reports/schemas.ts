// Zod input schemas: Sales reports (FR-021, FR-022, FR-047). Leaf 5.1.
import { z } from "zod";
import { REPORT_PERIODS } from "@/lib/dates";

/** Report filters from the page URL. Anything malformed falls back to today's daily report. */
export const reportFiltersSchema = z.object({
  period: z.enum(REPORT_PERIODS).catch("day"),
  /** A Manila calendar date inside the period, "2026-09-27". Defaults to today. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export type ReportFilters = z.output<typeof reportFiltersSchema>;

export const PERIOD_LABEL = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
} as const satisfies Record<(typeof REPORT_PERIODS)[number], string>;
