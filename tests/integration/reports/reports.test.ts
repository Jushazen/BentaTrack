import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PaymentMethod } from "@/generated/prisma/client";
import { getSalesReport, type SalesReport } from "@/features/reports/queries";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { Result } from "@/lib/result";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));

// Every expected figure below is worked out by hand from this fixture, not by the report code.
//
// Manila is UTC+8. Week of Mon 21 – Sun 27 Sep 2026 = [2026-09-20T16:00Z, 2026-09-27T16:00Z).
//  S1  Sun 20 Sep 23:59:59  CASH   1 × Tote ₱500 (cost ₱300)                       = ₱500
//  S2  Mon 21 Sep 00:00:00  CASH   2 × Tote ₱500 + 1 × Fan ₱250 (no cost), −₱250    = ₱1,000
//        (discount spread by price: Tote lines ₱800, Fan ₱200)
//  S3  Sun 27 Sep 23:59:59  GCASH  3 × Scarf ₱100 (cost ₱40)                        = ₱300
//  S4  Mon 28 Sep 00:00:00  CASH   1 × Tote                                         = ₱500
//  S5  Thu 1 Jan 2026 00:00 CASH   1 × Tote                                         = ₱500
//  S6  Wed 31 Dec 2025 23:59:59 CASH 1 × Tote                                       = ₱500
//  R1  Tue 22 Sep 10:00  refunds S1's tote (a sale from the week before)            = ₱500
//  R2  Mon 28 Sep 09:00  refunds one tote of S2                                     = ₱400
const TIMES = {
  s1: "2026-09-20T15:59:59Z",
  s2: "2026-09-20T16:00:00Z",
  s3: "2026-09-27T15:59:59Z",
  s4: "2026-09-27T16:00:00Z",
  s5: "2025-12-31T16:00:00Z",
  s6: "2025-12-31T15:59:59Z",
  r1: "2026-09-22T02:00:00Z",
  r2: "2026-09-28T01:00:00Z",
};
const NOW = new Date("2026-12-15T04:00:00Z");

async function signInAs(role: "OWNER" | "STAFF") {
  const user = await makeUser(role);
  session.current = { user: { id: user.id } };
  return user;
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

type Product = {
  id: string;
  name: string;
  code: string;
  sellingPrice: number;
  purchasePrice: number | null;
};

async function insertSale(
  staffId: string,
  occurredAt: string,
  lines: [Product, number][],
  { discount = 0, method = "CASH" as PaymentMethod } = {},
) {
  const subtotal = lines.reduce((sum, [p, q]) => sum + p.sellingPrice * q, 0);
  return db.sale.create({
    data: {
      id: randomUUID(),
      occurredAt: new Date(occurredAt),
      staffId,
      subtotal,
      discountType: discount ? "AMOUNT" : null,
      discountValue: discount || null,
      discountAmount: discount,
      total: subtotal - discount,
      paymentMethod: method,
      items: {
        create: lines.map(([p, quantity]) => ({
          productId: p.id,
          productName: p.name,
          productCode: p.code,
          quantity,
          unitPrice: p.sellingPrice,
          unitCost: p.purchasePrice,
        })),
      },
    },
    include: { items: true },
  });
}

async function insertRefund(
  userId: string,
  sale: { id: string; items: { id: string }[] },
  occurredAt: string,
  quantity: number,
  amount: number,
) {
  const saleItemId = sale.items[0].id;
  await db.saleItem.update({ where: { id: saleItemId }, data: { refundedQuantity: quantity } });
  await db.refund.create({
    data: {
      id: randomUUID(),
      saleId: sale.id,
      occurredAt: new Date(occurredAt),
      userId,
      amount,
      items: { create: [{ saleItemId, quantity, amount }] },
    },
  });
}

async function report(period: string, date: string): Promise<SalesReport> {
  return unwrap(await getSalesReport({ period, date }, NOW));
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
  const staff = await makeUser("STAFF");
  const categoryId = (await makeCategory("Bags")).id;
  const tote = await makeProduct(categoryId, {
    name: "Tote",
    code: "TOTE",
    sellingPrice: 50_000,
    purchasePrice: 30_000,
  });
  const fan = await makeProduct(categoryId, {
    name: "Fan",
    code: "FAN",
    sellingPrice: 25_000,
    purchasePrice: null,
  });
  const scarf = await makeProduct(categoryId, {
    name: "Scarf",
    code: "SCARF",
    sellingPrice: 10_000,
    purchasePrice: 4_000,
  });

  // S2's lines are inserted tote first, so the discount split is Tote ₱800 / Fan ₱200.
  const s1 = await insertSale(staff.id, TIMES.s1, [[tote, 1]]);
  const s2 = await insertSale(
    staff.id,
    TIMES.s2,
    [
      [tote, 2],
      [fan, 1],
    ],
    { discount: 25_000 },
  );
  await insertSale(staff.id, TIMES.s3, [[scarf, 3]], { method: "GCASH" });
  await insertSale(staff.id, TIMES.s4, [[tote, 1]]);
  await insertSale(staff.id, TIMES.s5, [[tote, 1]]);
  await insertSale(staff.id, TIMES.s6, [[tote, 1]]);
  await insertRefund(staff.id, s1, TIMES.r1, 1, 50_000);
  await insertRefund(staff.id, s2, TIMES.r2, 1, 40_000);
});

describe("sales reports", () => {
  test("[FR-021] the weekly report counts sales in the week and refunds on the day given", async () => {
    await signInAs("OWNER");
    const week = await report("week", "2026-09-24");

    expect(week.title).toBe("21–27 September 2026");
    expect(week.totals).toEqual({
      grossSales: 130_000, // S2 + S3
      refunds: 50_000, // R1, although S1 was the week before
      netSales: 80_000,
      discounts: 25_000,
      saleCount: 2,
      refundCount: 1,
      itemsSold: 6,
      itemsRefunded: 1,
    });
    expect(week.byPayment).toEqual([
      { method: "CASH", sales: 100_000, refunds: 50_000, net: 50_000 },
      { method: "GCASH", sales: 30_000, refunds: 0, net: 30_000 },
    ]);
    expect(week.buckets.map((b) => [b.label, b.netSales])).toEqual([
      ["Mon 21", 100_000],
      ["Tue 22", -50_000],
      ["Wed 23", 0],
      ["Thu 24", 0],
      ["Fri 25", 0],
      ["Sat 26", 0],
      ["Sun 27", 30_000],
    ]);
    expect(week.previousKey).toBe("2026-09-14");
    expect(week.nextKey).toBe("2026-09-28");
  });

  test("[FR-021] daily, monthly and yearly reports total the right sales and refunds", async () => {
    await signInAs("OWNER");
    const net = async (period: string, date: string) => {
      const { totals } = await report(period, date);
      return [totals.grossSales, totals.refunds, totals.netSales];
    };

    expect(await net("day", "2026-09-20")).toEqual([50_000, 0, 50_000]);
    expect(await net("day", "2026-09-22")).toEqual([0, 50_000, -50_000]);
    expect(await net("day", "2026-09-28")).toEqual([50_000, 40_000, 10_000]);
    expect(await net("month", "2026-09-10")).toEqual([230_000, 90_000, 140_000]);
    expect(await net("year", "2026-06-01")).toEqual([280_000, 90_000, 190_000]);
    expect(await net("year", "2025-06-01")).toEqual([50_000, 0, 50_000]);
  });

  test("[FR-021-TZ] a sale one second before Manila midnight belongs to the earlier day, week, month and year", async () => {
    await signInAs("OWNER");
    // S1 (Sun 23:59:59) and S2 (Mon 00:00:00) are one second apart.
    expect((await report("day", "2026-09-20")).totals.saleCount).toBe(1);
    expect((await report("day", "2026-09-21")).totals.grossSales).toBe(100_000);
    expect((await report("week", "2026-09-20")).totals.grossSales).toBe(50_000);
    // S3 (Sun 27, 23:59:59) is in the week of the 21st; S4 (Mon 28, 00:00) is not.
    expect((await report("week", "2026-09-28")).totals.grossSales).toBe(50_000);
    // S6 is New Year's Eve and S5 New Year's Day in Manila, although both are 31 Dec in UTC.
    expect((await report("month", "2025-12-01")).totals.grossSales).toBe(50_000);
    expect((await report("month", "2026-01-01")).totals.grossSales).toBe(50_000);
    expect((await report("day", "2026-01-01")).totals.saleCount).toBe(1);
    // The week of Mon 29 Dec – Sun 4 Jan spans both years.
    const newYearWeek = await report("week", "2026-01-01");
    expect(newYearWeek.title).toBe("29 December 2025–4 January 2026");
    expect(newYearWeek.totals.grossSales).toBe(100_000);
  });

  test("[FR-022] best sellers rank products by units sold less units refunded in the period", async () => {
    await signInAs("OWNER");
    const week = await report("week", "2026-09-24");
    expect(week.bestSellers.map((b) => [b.name, b.units, b.revenue])).toEqual([
      ["Scarf", 3, 30_000],
      ["Tote", 1, 30_000], // 2 sold (₱800) − 1 refunded (₱500)
      ["Fan", 1, 20_000],
    ]);

    // A day with only a refund of an older sale has no best sellers.
    const day = await report("day", "2026-09-22");
    expect(day.bestSellers).toEqual([]);
  });

  test("[FR-047] the owner sees gross profit: what was paid less purchase cost", async () => {
    await signInAs("OWNER");
    const week = await report("week", "2026-09-24");
    // Tote S2: ₱800 − 2 × ₱300 = ₱200. Scarf: ₱300 − 3 × ₱40 = ₱180.
    // R1 gives back ₱500 for a tote that cost ₱300: −₱200. Total ₱180.
    expect(week.profit).toEqual({ amount: 18_000, excludedUnits: 1 });
  });

  test("[FR-047-NOCOST] products sold without a purchase price are left out of profit", async () => {
    await signInAs("OWNER");
    // Day of S2: the fan (no cost) is excluded; only the totes count.
    const day = await report("day", "2026-09-21");
    expect(day.totals.grossSales).toBe(100_000);
    expect(day.profit).toEqual({ amount: 20_000, excludedUnits: 1 });
  });

  test("[REPORTS-STAFF] staff can't open sales reports or see profit", async () => {
    await signInAs("STAFF");
    const result = await getSalesReport({ period: "week", date: "2026-09-24" }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(can("STAFF", "reports.read")).toBe(false);
    expect(can("STAFF", "products.cost")).toBe(false);

    session.current = null;
    const anonymous = await getSalesReport({ period: "day" }, NOW);
    expect(anonymous.ok).toBe(false);
    if (!anonymous.ok) expect(anonymous.error.code).toBe("UNAUTHORIZED");
  });

  test("[FR-021] a malformed period or date falls back to today's daily report", async () => {
    await signInAs("OWNER");
    const result = await report("fortnight", "2026-02-30");
    expect(result.period).toBe("day");
    expect(result.dateKey).toBe("2026-12-15");
    expect(result.isCurrent).toBe(true);
    expect(result.nextKey).toBeNull();
  });
});
