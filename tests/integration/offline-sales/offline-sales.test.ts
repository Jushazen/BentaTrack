// Sales, dashboards, and reports offline (FR-049, leaf 9.3). For the same data, the device-store
// reads return exactly what the server queries return, to the centavo, for the owner and for
// staff. Changes waiting to sync are counted the way the server will record them: once the outbox
// is replayed through /api/sync, the server shows what the device showed. A sale recorded offline
// can be refunded before it syncs; the refund names lines by product and is accepted after it.
// The device store is filled the real way: the user's snapshot from /api/catalog.
import "fake-indexeddb/auto";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { deviceSnapshot } from "@/app/api/catalog/device-snapshot";
import { POST } from "@/app/api/sync/route";
import { getDashboard } from "@/features/dashboard/queries";
import { archiveProduct } from "@/features/products/actions";
import { refundSale } from "@/features/refunds/actions";
import { getSale, listSales } from "@/features/refunds/queries";
import type { RefundSaleInput } from "@/features/refunds/schemas";
import { getSalesReport } from "@/features/reports/queries";
import { recordSale } from "@/features/sales/actions";
import type { RecordSaleInput } from "@/features/sales/schemas";
import type { Role } from "@/generated/prisma/enums";
import { manilaDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { applySnapshot } from "@/lib/offline/catalog";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";
import { applyToCatalog, enqueue, outboxEntries, readEntry } from "@/lib/offline/outbox";
import {
  dashboardFrom,
  getSaleFrom,
  listSalesFrom,
  readSalesRecords,
  salesReportFrom,
  withPending,
  type ShopSales,
} from "@/lib/offline/sales-read";
import type { SnapshotProduct } from "@/lib/offline/snapshot";
import type { Result } from "@/lib/result";
import { makeCategory, makeProduct, resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request, and revalidatePath needs Next's request store.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type User = { id: string; name: string; role: Role };

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

function actAs(user: { id: string }) {
  session.current = { user: { id: user.id } };
}

async function makePerson(name: string, role: Role): Promise<User> {
  return db.user.create({
    data: {
      email: `${name.toLowerCase().replace(/\W+/g, ".")}-${randomUUID().slice(0, 6)}@test.local`,
      name,
      role,
      passwordHash: "not-a-real-hash",
    },
  });
}

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Product = Awaited<ReturnType<typeof makeProduct>>;

function sale(
  lines: [Product, number][],
  when: string,
  extra: Partial<RecordSaleInput> = {},
): RecordSaleInput {
  return {
    id: randomUUID(),
    occurredAt: when,
    items: lines.map(([p, quantity]) => ({ productId: p.id, quantity, unitPrice: p.sellingPrice })),
    discount: null,
    paymentMethod: "CASH",
    customerInfo: null,
    ...extra,
  };
}

function refund(saleId: string, items: RefundSaleInput["items"], when: string): RefundSaleInput {
  return { id: randomUUID(), occurredAt: when, saleId, items, note: "Wrong size" };
}

async function lineOf(saleId: string, productId: string): Promise<string> {
  const line = await db.saleItem.findFirstOrThrow({ where: { saleId, productId } });
  return line.id;
}

/**
 * A shop with sales across today, this week, this month, last month, and last year: discounts
 * by amount and by percent that don't split evenly, both payment methods, refunds given on later
 * days (some kept out of stock), a product renamed after it sold, an archived product, products
 * without a purchase price, and every stock state.
 */
async function seedShop() {
  const owner = await makePerson("Ana Owner", "OWNER");
  const staff = await makePerson("Bea Staff", "STAFF");
  const category = await makeCategory("Bags");
  const p = await Promise.all(
    [
      { name: "Banig Tote", sellingPrice: 45_000, purchasePrice: 20_000, stockQuantity: 80 },
      { name: "Piña Fan", sellingPrice: 33_333, purchasePrice: null, stockQuantity: 60 },
      { name: "Abaca Hat", sellingPrice: 12_999, purchasePrice: 7_000, stockQuantity: 50 },
      { name: "Capiz Lamp", sellingPrice: 99_950, purchasePrice: 61_000, stockQuantity: 40 },
      { name: "Coin Purse", sellingPrice: 5_000, purchasePrice: null, stockQuantity: 3 },
      { name: "Shell Earrings", sellingPrice: 7_500, purchasePrice: 3_000, stockQuantity: 0 },
      { name: "Buri Mat", sellingPrice: 25_000, purchasePrice: 9_000, stockQuantity: 6 },
    ].map((data, i) =>
      makeProduct(category.id, { ...data, code: `EST-${100 + i}`, lowStockThreshold: 5 }),
    ),
  );
  const [tote, fan, hat, lamp, purse, , mat] = p as [Product, ...Product[]] & Product[];

  const sales: { input: RecordSaleInput; by: User }[] = [
    {
      input: sale(
        [
          [tote, 2],
          [fan, 1],
        ],
        ago(380 * DAY),
        { paymentMethod: "GCASH" },
      ),
      by: owner,
    },
    {
      input: sale(
        [
          [lamp, 1],
          [hat, 3],
        ],
        ago(40 * DAY),
        { discount: { type: "PERCENT", value: 1250 } },
      ),
      by: staff,
    },
    {
      input: sale([[fan, 3]], ago(9 * DAY), { discount: { type: "AMOUNT", value: 1_001 } }),
      by: staff,
    },
    {
      input: sale(
        [
          [tote, 1],
          [hat, 1],
          [purse, 1],
        ],
        ago(3 * DAY),
        { customerInfo: "Maria" },
      ),
      by: owner,
    },
    {
      input: sale(
        [
          [mat, 1],
          [fan, 2],
        ],
        ago(2 * DAY + 3_600_000),
        { paymentMethod: "GCASH", discount: { type: "PERCENT", value: 333 } },
      ),
      by: staff,
    },
    { input: sale([[lamp, 2]], ago(5 * 3_600_000)), by: staff },
    {
      input: sale(
        [
          [tote, 3],
          [hat, 2],
          [fan, 1],
        ],
        ago(2 * 3_600_000),
        { discount: { type: "AMOUNT", value: 777 } },
      ),
      by: owner,
    },
    { input: sale([[hat, 1]], ago(30 * 60_000), { paymentMethod: "GCASH" }), by: staff },
  ];
  for (const { input, by } of sales) {
    actAs(by);
    unwrap(await recordSale(input));
  }
  const id = (i: number) => sales[i]!.input.id;

  // Refunds dated later than their sales, some in another period, one kept out of stock.
  actAs(staff);
  unwrap(
    await refundSale(
      refund(id(1), [{ saleItemId: await lineOf(id(1), hat.id), quantity: 2 }], ago(39 * DAY)),
    ),
  );
  unwrap(
    await refundSale(
      refund(
        id(2),
        [{ saleItemId: await lineOf(id(2), fan.id), quantity: 1, returnToStock: false }],
        ago(1 * DAY),
      ),
    ),
  );
  actAs(owner);
  unwrap(
    await refundSale(
      refund(
        id(6),
        [
          { saleItemId: await lineOf(id(6), tote.id), quantity: 1 },
          { saleItemId: await lineOf(id(6), fan.id), quantity: 1 },
        ],
        ago(60 * 60_000),
      ),
    ),
  );
  unwrap(
    await refundSale(
      refund(id(4), [{ saleItemId: await lineOf(id(4), fan.id), quantity: 2 }], ago(10 * 60_000)),
    ),
  );

  // Renamed after it sold: history keeps the old name.
  await db.product.update({ where: { id: hat.id }, data: { name: "Abaca Sun Hat" } });
  unwrap(await archiveProduct({ id: purse.id }));

  return { owner, staff, products: p, saleIds: sales.map((s) => s.input.id) };
}

const devices: OfflineDb[] = [];

/** The user's device store, filled from their snapshot the way the app fills it. */
async function deviceFor(user: { id: string }): Promise<OfflineDb> {
  actAs(user);
  const device = openOfflineDb(`offline-sales-${randomUUID()}`);
  devices.push(device);
  await applySnapshot(unwrap(await deviceSnapshot({})), new Date(), device);
  return device;
}

async function shopOn(
  device: OfflineDb,
  role: Role,
): Promise<{ shop: ShopSales; products: SnapshotProduct[] }> {
  const records = await readSalesRecords(device);
  return { shop: withPending(records, role), products: records.products };
}

/** Every report period, for now, the previous period, a few past dates, and junk input. */
function reportCases(now: Date) {
  const dates = [
    undefined,
    manilaDateKey(new Date(now.getTime() - 2 * DAY)),
    manilaDateKey(new Date(now.getTime() - 40 * DAY)),
    manilaDateKey(new Date(now.getTime() - 380 * DAY)),
    "2026-02-30",
    "garbage",
  ];
  const cases: Record<string, string>[] = [{}];
  for (const period of ["day", "week", "month", "year", "decade"]) {
    for (const date of dates) cases.push(date ? { period, date } : { period });
  }
  return cases;
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

afterEach(async () => {
  await Promise.all(devices.splice(0).map((device) => device.delete()));
});

test("[FR-049-REPORT-PARITY] offline reports equal the server's for every period, to the centavo", async () => {
  const shop = await seedShop();
  const now = new Date();
  const { shop: sales } = await shopOn(await deviceFor(shop.owner), "OWNER");
  expect(sales.waiting).toBe(0);

  actAs(shop.owner);
  let compared = 0;
  for (const filters of reportCases(now)) {
    const online = unwrap(await getSalesReport(filters, now));
    expect(unwrap(salesReportFrom(sales, "OWNER", filters, now)), JSON.stringify(filters)).toEqual(
      online,
    );
    compared += online.totals.saleCount;
  }
  // The cases really cover sales, refunds, discounts, profit, and best sellers.
  expect(compared).toBeGreaterThan(20);
  const year = unwrap(await getSalesReport({ period: "year" }, now));
  expect(year.totals.refundCount).toBeGreaterThan(0);
  expect(year.totals.discounts).toBeGreaterThan(0);
  expect(year.profit?.excludedUnits).toBeGreaterThan(0);
  expect(year.bestSellers.map((row) => row.name)).toContain("Abaca Hat");

  // Staff may not see reports either way.
  actAs(shop.staff);
  expect((await getSalesReport({}, now)).ok).toBe(false);
  const staffDevice = await shopOn(await deviceFor(shop.staff), "STAFF");
  expect(salesReportFrom(staffDevice.shop, "STAFF", {}, now)).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
});

/** The latest noon in Manila (UTC+8, no daylight saving) at or before the real clock. */
function latestManilaNoon(): Date {
  const noon = new Date();
  noon.setUTCHours(4, 0, 0, 0);
  if (noon.getTime() > Date.now()) noon.setTime(noon.getTime() - DAY);
  return noon;
}

test("[FR-049-DASHBOARD-PARITY] offline dashboards equal the server's, for the owner and for staff", async () => {
  // Today's seeded sales are 30 minutes to 5 hours old. Just after midnight in Manila they would
  // fall on yesterday, so the clock is pinned to the latest noon (leaf 9.7).
  vi.useFakeTimers({ toFake: ["Date"], now: latestManilaNoon() });
  try {
    const shop = await seedShop();
    const now = new Date();
    for (const user of [shop.owner, shop.staff]) {
      const { shop: sales, products } = await shopOn(await deviceFor(user), user.role);
      actAs(user);
      const online = unwrap(await getDashboard(now));
      expect(unwrap(dashboardFrom(sales, products, user.role, now)), user.role).toEqual(online);
      expect(online.kind).toBe(user.role === "OWNER" ? "owner" : "staff");
      expect(online.today.saleCount).toBeGreaterThan(0);
      expect(online.lowStock.count).toBeGreaterThan(0);
    }
  } finally {
    vi.useRealTimers();
  }
});

test("[FR-049-PENDING-VISIBLE] offline sales history and sale pages equal the server's", async () => {
  const shop = await seedShop();
  for (const user of [shop.owner, shop.staff]) {
    const { shop: sales } = await shopOn(await deviceFor(user), user.role);
    actAs(user);
    for (const filters of [
      {},
      { q: "maria" },
      { q: "abaca" },
      { q: "EST-101" },
      { q: "%" },
      { q: "nothing" },
      { page: "2" },
    ]) {
      expect(listSalesFrom(sales, user.role, filters), JSON.stringify(filters)).toEqual(
        await listSales(filters),
      );
    }
    for (const id of [...shop.saleIds, randomUUID(), "not-a-uuid"]) {
      expect(getSaleFrom(sales, user.role, id), id).toEqual(await getSale(id));
    }
  }
});

/** Sends the device's outbox to /api/sync in order, as the replay does. */
async function replay(device: OfflineDb, user: User) {
  actAs(user);
  const answers: Result<unknown>[] = [];
  for (const raw of await outboxEntries(device)) {
    const entry = readEntry(raw)!;
    const response = await POST(
      new Request("http://localhost/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: entry.kind, recordedBy: user.id, input: entry.payload.input }),
      }),
    );
    answers.push((await response.json()) as Result<unknown>);
    await device.outbox.delete(entry.id);
  }
  return answers;
}

/** The same data without the "waiting to sync" marks. */
function synced<T>(value: T): T {
  if (Array.isArray(value)) return value.map(synced) as T;
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [key, key === "pending" ? false : synced(field)]),
  ) as T;
}

test("[FR-049-PENDING-VISIBLE] changes waiting to sync are counted as the server will record them", async () => {
  const shop = await seedShop();
  const device = await deviceFor(shop.staff);
  const [tote, fan, hat, lamp, , , mat] = shop.products as Product[];

  // Recorded offline: two new sales, a refund of one of them before it syncs (by product), and a
  // refund of a sale the device already had (by line), as the checkout and refund forms save them.
  const queued: [kind: "SALE" | "REFUND", input: RecordSaleInput | RefundSaleInput][] = [];
  const first = sale(
    [
      [tote!, 2],
      [fan!, 1],
      [lamp!, 1],
    ],
    ago(20 * 60_000),
    { discount: { type: "PERCENT", value: 777 }, customerInfo: "Offline Olga" },
  );
  const second = sale(
    [
      [hat!, 2],
      [mat!, 1],
    ],
    ago(15 * 60_000),
    { paymentMethod: "GCASH", discount: { type: "AMOUNT", value: 999 } },
  );
  queued.push(["SALE", first], ["SALE", second]);
  queued.push([
    "REFUND",
    refund(
      first.id,
      [
        { productId: fan!.id, quantity: 1 },
        { productId: tote!.id, quantity: 1, returnToStock: false },
      ],
      ago(10 * 60_000),
    ),
  ]);
  queued.push([
    "REFUND",
    refund(
      shop.saleIds[7]!,
      [{ saleItemId: await lineOf(shop.saleIds[7]!, hat!.id), quantity: 1 }],
      ago(5 * 60_000),
    ),
  ]);
  for (const [kind, input] of queued) {
    await enqueue(kind, input as never, shop.staff, device);
    await applyToCatalog(kind, input as never, device);
  }

  const now = new Date();
  const before = await shopOn(device, "STAFF");
  expect(before.shop.waiting).toBe(4);
  const offline = {
    dashboard: unwrap(dashboardFrom(before.shop, before.products, "STAFF", now)),
    sales: unwrap(listSalesFrom(before.shop, "STAFF")),
    first: unwrap(getSaleFrom(before.shop, "STAFF", first.id)),
    old: unwrap(getSaleFrom(before.shop, "STAFF", shop.saleIds[7]!)),
  };
  expect(offline.sales.items.filter((row) => row.pending).map((row) => row.id)).toEqual([
    second.id,
    first.id,
  ]);
  expect(offline.first.pending).toBe(true);
  expect(offline.first.refunds.map((r) => r.pending)).toEqual([true]);
  expect(offline.old.refunds.at(-1)?.pending).toBe(true);
  expect(offline.dashboard.recentSales.slice(0, 2).map((row) => row.pending)).toEqual([true, true]);

  // The owner's device sees the same queue on its reports (e.g. a shared tablet).
  const ownerDevice = await deviceFor(shop.owner);
  for (const [kind, input] of queued) await enqueue(kind, input as never, shop.staff, ownerDevice);
  const ownerBefore = await shopOn(ownerDevice, "OWNER");
  const offlineReports = ["day", "week", "month", "year"].map((period) =>
    unwrap(salesReportFrom(ownerBefore.shop, "OWNER", { period }, now)),
  );

  const answers = await replay(device, shop.staff);
  expect(answers.map((answer) => answer.ok)).toEqual([true, true, true, true]);

  actAs(shop.staff);
  expect(synced(offline.dashboard)).toEqual(synced(unwrap(await getDashboard(now))));
  expect(synced(offline.sales)).toEqual(unwrap(await listSales()));
  // Its line ids are given by the server when it stores the sale; everything else matches.
  const withoutLineIds = (detail: typeof offline.first) => ({
    ...detail,
    items: detail.items.map((item) => ({ ...item, id: "" })),
  });
  expect(withoutLineIds(synced(offline.first))).toEqual(
    withoutLineIds(unwrap(await getSale(first.id))),
  );
  expect(synced(offline.old)).toEqual(unwrap(await getSale(shop.saleIds[7]!)));
  actAs(shop.owner);
  for (const report of offlineReports) {
    expect(report, report.period).toEqual(
      unwrap(await getSalesReport({ period: report.period }, now)),
    );
  }
  // The device's stock already showed what the server now holds.
  const stock = new Map((await db.product.findMany()).map((row) => [row.id, row.stockQuantity]));
  for (const row of before.products) expect(row.stockQuantity, row.name).toBe(stock.get(row.id));
});

async function post(user: User, kind: "SALE" | "REFUND", input: unknown) {
  actAs(user);
  const response = await POST(
    new Request("http://localhost/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, recordedBy: user.id, input }),
    }),
  );
  return (await response.json()) as Result<{ amount?: number; replayed: boolean }>;
}

test("[FR-049-REFUND-UNSYNCED] a refund of an unsynced sale, sent after its sale, is accepted; sent before it, it is refused and kept", async () => {
  const staff = await makePerson("Bea Staff", "STAFF");
  const category = await makeCategory("Bags");
  const tote = await makeProduct(category.id, {
    name: "Banig Tote",
    sellingPrice: 45_000,
    stockQuantity: 10,
  });
  const fan = await makeProduct(category.id, {
    name: "Piña Fan",
    sellingPrice: 33_333,
    stockQuantity: 10,
  });
  const offlineSale = sale(
    [
      [tote, 2],
      [fan, 3],
    ],
    ago(20 * 60_000),
    { discount: { type: "PERCENT", value: 1000 } },
  );
  const offlineRefund = refund(
    offlineSale.id,
    [
      { productId: fan.id, quantity: 2 },
      { productId: tote.id, quantity: 1, returnToStock: false },
    ],
    ago(10 * 60_000),
  );

  // Out of order (e.g. another device's replay), the server doesn't know the sale yet.
  expect(await post(staff, "REFUND", offlineRefund)).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });

  expect((await post(staff, "SALE", offlineSale)).ok).toBe(true);
  const accepted = await post(staff, "REFUND", offlineRefund);
  // ₱1,116.66 of the ₱1,899.99 of goods, of which ₱1,709.99 was paid after the 10% discount.
  expect(accepted).toMatchObject({ ok: true, data: { replayed: false, amount: 100_499 } });
  // Replaying it again changes nothing.
  expect(await post(staff, "REFUND", offlineRefund)).toMatchObject({
    ok: true,
    data: { replayed: true, amount: 100_499 },
  });

  const saved = await db.refund.findUniqueOrThrow({
    where: { id: offlineRefund.id },
    include: { items: { include: { saleItem: true } } },
  });
  expect(
    saved.items.map((item) => [item.saleItem.productId, item.quantity, item.returnedToStock]),
  ).toEqual([
    [fan.id, 2, true],
    [tote.id, 1, false],
  ]);
  expect((await db.product.findUniqueOrThrow({ where: { id: fan.id } })).stockQuantity).toBe(9);
  expect((await db.product.findUniqueOrThrow({ where: { id: tote.id } })).stockQuantity).toBe(8);

  // Naming one line twice (by id and by product), or a product not in the sale, is refused.
  const line = await lineOf(offlineSale.id, tote.id);
  expect(
    await post(
      staff,
      "REFUND",
      refund(
        offlineSale.id,
        [
          { saleItemId: line, quantity: 1 },
          { productId: tote.id, quantity: 1 },
        ],
        ago(60_000),
      ),
    ),
  ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  const other = await makeProduct(category.id);
  expect(
    await post(
      staff,
      "REFUND",
      refund(offlineSale.id, [{ productId: other.id, quantity: 1 }], ago(60_000)),
    ),
  ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  // A line must name its sale line one way or the other, not both.
  expect(
    await post(
      staff,
      "REFUND",
      refund(
        offlineSale.id,
        [{ saleItemId: line, productId: tote.id, quantity: 1 } as never],
        ago(60_000),
      ),
    ),
  ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
});
