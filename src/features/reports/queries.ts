// Server-side reads: Sales reports (FR-021, FR-022, FR-047). Leaf 5.1. Owner only: staff are
// refused (FR-032). Gross profit also needs the cost capability, which only the owner has.
// The report itself is built by ./sales-report.ts, which the offline app uses too (leaf 9.3).
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ok, type Result } from "@/lib/result";
import { buildPeriodReport, reportWindow, type SalesReport } from "./sales-report";

export type { SalesReport };

const productRef = { productId: true, productName: true, productCode: true, unitCost: true };
/** Oldest first, so a product's name in the report (from its first line) is always the same one. */
const reportOrder = [
  { occurredAt: "asc" as const },
  { recordedAt: "asc" as const },
  { id: "asc" as const },
];

/** The report for the period in `rawFilters` (usually the page URL), as of `now`. */
export async function getSalesReport(
  rawFilters: unknown = {},
  now: Date = new Date(),
): Promise<Result<SalesReport>> {
  const auth = await requireCapability("reports.read");
  if (!auth.ok) return auth;
  const window = reportWindow(rawFilters, now);
  const inRange = { gte: window.range.start, lt: window.range.end };

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

  return ok(
    buildPeriodReport({
      window,
      sales,
      refunds: refunds.map(({ sale, ...refund }) => ({
        ...refund,
        paymentMethod: sale.paymentMethod,
      })),
      includeProfit: can(auth.data.role, "products.cost"),
      now,
    }),
  );
}
