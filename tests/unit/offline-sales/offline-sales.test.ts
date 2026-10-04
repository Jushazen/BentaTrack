// Sales, refunds, dashboards, and reports offline (FR-049, leaf 9.3): changes waiting in the
// outbox show up, marked, with the amounts the server will record; a sale that hasn't synced can
// be refunded, and that refund waits behind its sale.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { refundSaleSchema, type RefundSaleInput } from "@/features/refunds/schemas";
import type { RecordSaleInput } from "@/features/sales/schemas";
import { toCatalogProduct } from "@/lib/offline/catalog";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";
import { markRefused, outboxEntries } from "@/lib/offline/outbox";
import {
  dashboardFrom,
  getSaleFrom,
  listSalesFrom,
  readSalesRecords,
  salesReportFrom,
  withPending,
  type SalesRecords,
} from "@/lib/offline/sales-read";
import type { SnapshotProduct, SnapshotSale } from "@/lib/offline/snapshot";
import { flushOutbox, runCommand, setSyncUser } from "@/lib/offline/sync";
import { ok, type Result } from "@/lib/result";

const ANA = { id: "user-ana", name: "Ana Owner" };
let db: OfflineDb;
let dbCount = 0;
let sent: { kind: string; input: { id: string } }[];

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

function product(id: string, overrides: Partial<SnapshotProduct> = {}): SnapshotProduct {
  return {
    id,
    name: `Product ${id}`,
    code: id.toUpperCase(),
    barcode: null,
    brand: null,
    categoryId: "c1",
    categoryName: "Bags",
    supplierId: null,
    purchasePrice: 20_000,
    sellingPrice: 50_000,
    stockQuantity: 10,
    lowStockThreshold: 5,
    expirationDate: null,
    imageUrl: null,
    archivedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A sale the device already holds from the server. */
function storedSale(): SnapshotSale {
  return {
    id: randomUUID(),
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    recordedAt: new Date(Date.now() - 60_000).toISOString(),
    staffId: ANA.id,
    staffName: ANA.name,
    customerInfo: null,
    subtotal: 50_000,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    total: 50_000,
    paymentMethod: "GCASH",
    items: [
      {
        id: "line-stored",
        productId: "bag",
        productName: "Product bag",
        productCode: "BAG",
        quantity: 1,
        unitPrice: 50_000,
        unitCost: 20_000,
        refundedQuantity: 0,
      },
    ],
  };
}

function saleInput(overrides: Partial<RecordSaleInput> = {}): RecordSaleInput {
  return {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    // 3 × ₱500 + 1 × ₱333 = ₱1,833, less 10%.
    items: [
      { productId: "bag", quantity: 3, unitPrice: 50_000 },
      { productId: "fan", quantity: 1, unitPrice: 33_300 },
    ],
    discount: { type: "PERCENT", value: 1000 },
    paymentMethod: "CASH",
    customerInfo: "  Maria  ",
    ...overrides,
  };
}

function refundInput(saleId: string, items: RefundSaleInput["items"]): RefundSaleInput {
  return {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    saleId,
    items,
    note: "Wrong size",
  };
}

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

async function records(): Promise<SalesRecords> {
  return readSalesRecords(db);
}

beforeEach(async () => {
  db = openOfflineDb(`bentatrack-offline-sales-${++dbCount}`);
  sent = [];
  setSyncUser(ANA);
  await db.products.bulkPut([
    toCatalogProduct(product("bag")),
    toCatalogProduct(
      product("fan", { sellingPrice: 33_300, purchasePrice: null, stockQuantity: 2 }),
    ),
  ]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setSyncUser(null);
  await db.delete();
});

test("[FR-049-PENDING-VISIBLE] a sale recorded offline shows in sales history, marked, with the totals the server will record", async () => {
  setOnline(false);
  const stored = storedSale();
  await db.sales.put(stored);
  const input = saleInput();
  expect(await runCommand("SALE", input, db)).toEqual({ ok: true, data: { queued: true } });

  const shop = withPending(await records(), "OWNER");
  expect(shop.waiting).toBe(1);
  const list = unwrap(listSalesFrom(shop, "OWNER"));
  expect(list.items.map((sale) => [sale.id, sale.pending])).toEqual([
    [input.id, true],
    [stored.id, false],
  ]);
  expect(list.items[0]).toMatchObject({
    staffName: ANA.name,
    customerInfo: "Maria",
    // ₱1,833.00 less 10% (₱183.30).
    total: 164_970,
    itemCount: 4,
    paymentMethod: "CASH",
    refundState: "NONE",
    refundedAmount: 0,
  });
  // Searching finds it by product name, code, or customer, as online.
  expect(unwrap(listSalesFrom(shop, "OWNER", { q: "maria" })).items.map((s) => s.id)).toEqual([
    input.id,
  ]);
  expect(unwrap(listSalesFrom(shop, "OWNER", { q: "FAN" })).items.map((s) => s.id)).toEqual([
    input.id,
  ]);

  const detail = unwrap(getSaleFrom(shop, "STAFF", input.id));
  expect(detail).toMatchObject({ pending: true, subtotal: 183_300, discountAmount: 18_330 });
  expect(detail.items.map((item) => [item.productName, item.quantity])).toEqual([
    ["Product bag", 3],
    ["Product fan", 1],
  ]);

  // The dashboard and today's report count it.
  const dashboard = unwrap(dashboardFrom(shop, (await records()).products, "STAFF"));
  expect(dashboard.today).toMatchObject({ saleCount: 2, grossSales: 214_970, itemsSold: 5 });
  expect(dashboard.recentSales[0]).toMatchObject({ id: input.id, pending: true });
  expect(dashboard.lowStock.items.map((item) => [item.id, item.quantity])).toEqual([["fan", 1]]);
  const report = unwrap(salesReportFrom(shop, "OWNER", { period: "day" }));
  expect(report.totals).toMatchObject({ grossSales: 214_970, saleCount: 2, itemsSold: 5 });
  expect(report.byPayment.find((row) => row.method === "CASH")?.sales).toBe(164_970);
  // Staff never see reports.
  expect(salesReportFrom(shop, "STAFF").ok).toBe(false);
});

test("[FR-049-PENDING-VISIBLE] refused changes are left out, and a change that already synced counts once", async () => {
  setOnline(false);
  const refused = saleInput();
  await runCommand("SALE", refused, db);
  await markRefused(refused.id, "Not enough stock for this sale.", db);
  const synced = saleInput();
  await runCommand("SALE", synced, db);
  // The server applied it, but its reply was lost: the snapshot already has it.
  await db.sales.put({ ...storedSale(), id: synced.id });

  const shop = withPending(await records(), "OWNER");
  expect(shop.waiting).toBe(0);
  expect(shop.sales.map((sale) => [sale.id, sale.pending])).toEqual([[synced.id, false]]);
});

test("[FR-049-REFUND-UNSYNCED] a sale recorded offline can be refunded before it syncs, by product, with the server's amounts", async () => {
  setOnline(false);
  const input = saleInput();
  await runCommand("SALE", input, db);
  expect((await db.products.get("bag"))?.stockQuantity).toBe(7);

  const detail = unwrap(getSaleFrom(withPending(await records(), "STAFF"), "STAFF", input.id));
  const bag = detail.items.find((item) => item.productId === "bag")!;
  const refund = refundInput(input.id, [{ productId: bag.productId!, quantity: 2 }]);
  expect(refundSaleSchema.safeParse(refund).success).toBe(true);
  expect(await runCommand("REFUND", refund, db)).toEqual({ ok: true, data: { queued: true } });

  // Queued after its sale, and the units are back on the device's shelf.
  expect((await outboxEntries(db)).map((entry) => entry.kind)).toEqual(["SALE", "REFUND"]);
  expect((await db.products.get("bag"))?.stockQuantity).toBe(9);

  const shop = withPending(await records(), "OWNER");
  expect(shop.waiting).toBe(2);
  const after = unwrap(getSaleFrom(shop, "OWNER", input.id));
  // 2 of the ₱1,500.00 of bags, less the sale's 10%: ₱900.00.
  expect(after).toMatchObject({ refundState: "PARTIAL", refundedAmount: 90_000 });
  expect(after.refunds).toMatchObject([
    {
      pending: true,
      amount: 90_000,
      userName: ANA.name,
      note: "Wrong size",
      items: [{ productName: "Product bag", quantity: 2, returnedToStock: true }],
    },
  ]);
  expect(after.items.find((item) => item.productId === "bag")?.refundedQuantity).toBe(2);
  const report = unwrap(salesReportFrom(shop, "OWNER"));
  expect(report.totals).toMatchObject({ refunds: 90_000, refundCount: 1, itemsRefunded: 2 });
  expect(report.totals.netSales).toBe(164_970 - 90_000);

  // A second refund for more than is left would be refused, so it isn't counted.
  await runCommand("REFUND", refundInput(input.id, [{ productId: "bag", quantity: 2 }]), db);
  expect(withPending(await records(), "OWNER").waiting).toBe(2);
});

test("[FR-049-REFUND-UNSYNCED] online, a refund of a sale still waiting to sync goes after it: the sale is sent first", async () => {
  setOnline(false);
  const input = saleInput();
  await runCommand("SALE", input, db);

  setOnline(true);
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push(body);
    return Response.json(ok({ id: body.input.id, replayed: false, lowStockAlerts: [] }));
  });
  vi.stubGlobal("fetch", fetchMock);

  const refund = refundInput(input.id, [{ productId: "fan", quantity: 1, returnToStock: false }]);
  // Never sent on its own (the server doesn't know the sale yet): the queue goes first, in order,
  // and the form gets the server's answer for the refund (leaf 9.4).
  const reply = await runCommand("REFUND", refund, db);
  expect(reply).toMatchObject({ ok: true, data: { id: refund.id, queued: false } });
  expect(sent.map((body) => [body.kind, body.input.id])).toEqual([
    ["SALE", input.id],
    ["REFUND", refund.id],
  ]);
  // Kept out of stock (damaged), so the device's stock doesn't move.
  expect((await db.products.get("fan"))?.stockQuantity).toBe(1);
  expect(await outboxEntries(db)).toEqual([]);
  expect((await flushOutbox({ db })).synced).toEqual([]);
});

test("[FR-049-REFUND-UNSYNCED] a refund of a synced sale returns its units to the device's stock", async () => {
  setOnline(false);
  const stored = storedSale();
  await db.sales.put(stored);
  await runCommand(
    "REFUND",
    refundInput(stored.id, [{ saleItemId: "line-stored", quantity: 1 }]),
    db,
  );
  expect((await db.products.get("bag"))?.stockQuantity).toBe(11);
  const detail = unwrap(getSaleFrom(withPending(await records(), "STAFF"), "STAFF", stored.id));
  expect(detail).toMatchObject({ refundState: "FULL", refundedAmount: 50_000, pending: false });
  expect(detail.refunds[0]).toMatchObject({ pending: true, amount: 50_000 });
});
