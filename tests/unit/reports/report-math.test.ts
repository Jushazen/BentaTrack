import { expect, test } from "vitest";
import { buildSalesReport, type ReportSale } from "@/features/reports/report-math";

const at = new Date("2026-09-24T02:00:00Z");

function line(name: string, quantity: number, unitPrice: number, unitCost: number | null) {
  return {
    productId: `id-${name}`,
    productName: name,
    productCode: name,
    quantity,
    unitPrice,
    unitCost,
  };
}

function sale(items: ReportSale["items"], discount = 0): ReportSale {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return { occurredAt: at, subtotal, total: subtotal - discount, paymentMethod: "CASH", items };
}

test("[FR-022] best sellers rank by units sold, then by revenue, and spread discounts over lines", () => {
  const report = buildSalesReport({
    sales: [
      sale([line("Tote", 1, 50_000, 30_000), line("Fan", 1, 50_000, 20_000)], 10_000),
      sale([line("Scarf", 3, 10_000, 4_000)]),
      sale([line("Fan", 1, 50_000, 20_000)]),
    ],
    refunds: [],
    buckets: [],
    includeProfit: false,
  });

  expect(report.bestSellers.map((b) => [b.name, b.units, b.revenue])).toEqual([
    ["Scarf", 3, 30_000],
    ["Fan", 2, 95_000],
    ["Tote", 1, 45_000],
  ]);
  expect(report.profit).toBeNull();
});

test("[FR-047-NOCOST] lines without a purchase price are left out of gross profit and counted", () => {
  const report = buildSalesReport({
    sales: [sale([line("Tote", 2, 50_000, 30_000), line("Staff-added", 3, 10_000, null)])],
    refunds: [],
    buckets: [],
    includeProfit: true,
  });

  // Tote: 2 × (₱500 − ₱300) = ₱400. The staff-added product has no cost yet, so it's excluded.
  expect(report.profit).toEqual({ amount: 40_000, excludedUnits: 3 });
  expect(report.totals.grossSales).toBe(130_000);
});
