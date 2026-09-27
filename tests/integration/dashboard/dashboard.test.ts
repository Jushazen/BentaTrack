import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import type { PaymentMethod } from "@/generated/prisma/client";
import { getDashboard, type Dashboard } from "@/features/dashboard/queries";
import { db } from "@/lib/db";
import type { Result } from "@/lib/result";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));

// Every expected figure is worked out by hand from this fixture. Manila is UTC+8.
// "Now" is Sunday 27 Sep 2026, 12:00 in Manila.
//
// Products: Tote 10 in stock (cost ₱300) · Fan 3 (low, no cost) · Scarf 0 (out) · Belt 5 (low,
// exactly at its threshold of 5). Units in stock: 18.
//  S1  Sun 27 Sep 00:00:00  CASH   2 × Tote ₱500  = ₱1,000   (today)
//  S2  Sun 27 Sep 11:00     GCASH  1 × Fan ₱250   = ₱250     (today)
//  S3  Sat 26 Sep 23:59:59  CASH   1 × Tote       = ₱500     (yesterday, this month)
//  S4  Mon 31 Aug 23:59:59  CASH   5 × Scarf ₱100 = ₱500     (last month)
//  R1  Sun 27 Sep 10:00  refunds S3's tote          = ₱500     (today)
const NOW = new Date("2026-09-27T04:00:00Z");

type Product = {
  id: string;
  name: string;
  code: string;
  sellingPrice: number;
  purchasePrice: number | null;
};

let ids: {
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  fan: string;
  scarf: string;
  belt: string;
};

async function signInAs(role: "OWNER" | "STAFF") {
  const user = await makeUser(role);
  session.current = { user: { id: user.id } };
  return user;
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

async function insertSale(
  staffId: string,
  occurredAt: string,
  product: Product,
  quantity: number,
  method: PaymentMethod = "CASH",
) {
  const total = product.sellingPrice * quantity;
  return db.sale.create({
    data: {
      id: randomUUID(),
      occurredAt: new Date(occurredAt),
      staffId,
      subtotal: total,
      total,
      paymentMethod: method,
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            quantity,
            unitPrice: product.sellingPrice,
            unitCost: product.purchasePrice,
          },
        ],
      },
    },
    include: { items: true },
  });
}

async function dashboard(): Promise<Dashboard> {
  return unwrap(await getDashboard(NOW));
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
    stockQuantity: 10,
  });
  const fan = await makeProduct(categoryId, {
    name: "Fan",
    code: "FAN",
    sellingPrice: 25_000,
    purchasePrice: null,
    stockQuantity: 3,
  });
  const scarf = await makeProduct(categoryId, {
    name: "Scarf",
    code: "SCARF",
    sellingPrice: 10_000,
    purchasePrice: 4_000,
    stockQuantity: 0,
  });
  const belt = await makeProduct(categoryId, {
    name: "Belt",
    code: "BELT",
    purchasePrice: 1_000,
    stockQuantity: 5,
    lowStockThreshold: 5,
  });

  const s1 = await insertSale(staff.id, "2026-09-26T16:00:00Z", tote, 2);
  const s2 = await insertSale(staff.id, "2026-09-27T03:00:00Z", fan, 1, "GCASH");
  const s3 = await insertSale(staff.id, "2026-09-26T15:59:59Z", tote, 1);
  const s4 = await insertSale(staff.id, "2026-08-31T15:59:59Z", scarf, 5);
  await db.refund.create({
    data: {
      id: randomUUID(),
      saleId: s3.id,
      occurredAt: new Date("2026-09-27T02:00:00Z"),
      userId: staff.id,
      amount: 50_000,
      items: { create: [{ saleItemId: s3.items[0].id, quantity: 1, amount: 50_000 }] },
    },
  });
  ids = { s1: s1.id, s2: s2.id, s3: s3.id, s4: s4.id, fan: fan.id, scarf: scarf.id, belt: belt.id };
});

test("[FR-025] today's summary counts sales since Manila midnight and refunds given today", async () => {
  await signInAs("OWNER");
  const { today } = await dashboard();
  expect(today).toEqual({
    title: "Sunday, 27 September 2026",
    grossSales: 125_000, // S1 + S2; S3 was one second before midnight
    refunds: 50_000, // R1, although its sale was yesterday
    netSales: 75_000,
    saleCount: 2,
    itemsSold: 3,
  });
});

test("[FR-023] the owner sees total products, units in stock, and low and out of stock", async () => {
  await signInAs("OWNER");
  const owner = await dashboard();
  if (owner.kind !== "owner") throw new Error("expected the owner dashboard");
  expect(owner.totalProducts).toBe(4);
  expect(owner.unitsInStock).toBe(18);
  expect(owner.outOfStockCount).toBe(1);
  expect(owner.lowStock.count).toBe(3);
  expect(owner.lowStock.items.map((item) => [item.name, item.quantity, item.status])).toEqual([
    ["Scarf", 0, "OUT_OF_STOCK"],
    ["Fan", 3, "LOW_STOCK"],
    ["Belt", 5, "LOW_STOCK"],
  ]);
});

test("[FR-024] recent sales are newest first, and best sellers cover this Manila month", async () => {
  await signInAs("OWNER");
  const owner = await dashboard();
  if (owner.kind !== "owner") throw new Error("expected the owner dashboard");
  expect(owner.recentSales.map((sale) => sale.id)).toEqual([ids.s2, ids.s1, ids.s3, ids.s4]);
  expect(owner.recentSales[0]).toMatchObject({
    total: 25_000,
    itemCount: 1,
    paymentMethod: "GCASH",
    staffName: "Test Staff",
  });
  // Tote: 3 sold this month, 1 refunded. Fan: 1. The scarves were sold in August.
  expect(owner.bestSellers.title).toBe("September 2026");
  expect(owner.bestSellers.items.map((item) => [item.name, item.units, item.revenue])).toEqual([
    ["Tote", 2, 100_000],
    ["Fan", 1, 25_000],
  ]);
});

test("[NEEDS-COST-DASH] the owner's dashboard lists products that still need a purchase price", async () => {
  await signInAs("OWNER");
  const owner = await dashboard();
  if (owner.kind !== "owner") throw new Error("expected the owner dashboard");
  expect(owner.needsCost).toEqual({
    count: 1,
    items: [{ id: ids.fan, name: "Fan", code: "FAN" }],
  });

  await db.product.update({ where: { id: ids.fan }, data: { purchasePrice: 12_000 } });
  const after = await dashboard();
  if (after.kind !== "owner") throw new Error("expected the owner dashboard");
  expect(after.needsCost).toEqual({ count: 0, items: [] });
});

test("[FR-023A] staff get only today's sales, low stock and recent sales, with no costs", async () => {
  await signInAs("STAFF");
  const staff = await dashboard();
  expect(staff.kind).toBe("staff");
  expect(Object.keys(staff).sort()).toEqual(["kind", "lowStock", "recentSales", "today"]);
  expect(staff.today.netSales).toBe(75_000);
  expect(staff.lowStock.count).toBe(3);
  expect(staff.recentSales).toHaveLength(4);
  const json = JSON.stringify(staff);
  for (const hidden of ["unitCost", "purchasePrice", "profit", "needsCost", "bestSellers"]) {
    expect(json).not.toContain(hidden);
  }

  session.current = null;
  const anonymous = await getDashboard(NOW);
  expect(anonymous.ok).toBe(false);
  if (!anonymous.ok) expect(anonymous.error.code).toBe("UNAUTHORIZED");
});
