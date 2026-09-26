import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { deleteProduct } from "@/features/products/actions";
import { refundSale, type RefundResult } from "@/features/refunds/actions";
import { getSale, listSales } from "@/features/refunds/queries";
import { refundAmounts } from "@/features/refunds/refund-math";
import type { RefundSaleInput } from "@/features/refunds/schemas";
import { recordSale } from "@/features/sales/actions";
import type { RecordSaleInput } from "@/features/sales/schemas";
import { db } from "@/lib/db";
import type { Result } from "@/lib/result";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request, and revalidatePath needs Next's request store.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function signInAs(role: "OWNER" | "STAFF") {
  const user = await makeUser(role);
  session.current = { user: { id: user.id } };
  return user;
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

type Line = { id: string; sellingPrice: number };

/** Records a sale and returns its id and its lines keyed by product id. */
async function sell(lines: [Line, number][], extra: Partial<RecordSaleInput> = {}) {
  const sale = unwrap(
    await recordSale({
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      items: lines.map(([product, quantity]) => ({
        productId: product.id,
        quantity,
        unitPrice: product.sellingPrice,
      })),
      paymentMethod: "CASH",
      ...extra,
    }),
  );
  const items = await db.saleItem.findMany({ where: { saleId: sale.id } });
  const lineOf = (product: Line) => {
    const item = items.find((i) => i.productId === product.id);
    if (!item) throw new Error("no sale line for product");
    return item.id;
  };
  return { saleId: sale.id, total: sale.total, lineOf };
}

function refund(
  saleId: string,
  items: [saleItemId: string, quantity: number][],
  extra: Partial<RefundSaleInput> = {},
): Promise<Result<RefundResult>> {
  return refundSale({
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    saleId,
    items: items.map(([saleItemId, quantity]) => ({ saleItemId, quantity })),
    ...extra,
  });
}

async function stockOf(id: string) {
  return (await db.product.findUniqueOrThrow({ where: { id } })).stockQuantity;
}

let categoryId: string;

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
  categoryId = (await makeCategory("Bags")).id;
});

test("[FR-039] a partial refund returns those units to stock and records the money returned", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { sellingPrice: 50_000, stockQuantity: 10 });
  const fan = await makeProduct(categoryId, { sellingPrice: 25_000, stockQuantity: 10 });
  const sale = await sell([
    [tote, 3],
    [fan, 2],
  ]);
  expect(await stockOf(tote.id)).toBe(7);

  const result = unwrap(await refund(sale.saleId, [[sale.lineOf(tote), 2]], { note: "Too big" }));

  expect(result).toMatchObject({ saleId: sale.saleId, amount: 100_000, itemCount: 2 });
  expect(await stockOf(tote.id)).toBe(9);
  expect(await stockOf(fan.id)).toBe(8);
  const saved = await db.refund.findUniqueOrThrow({
    where: { id: result.id },
    include: { items: true },
  });
  expect(saved).toMatchObject({ saleId: sale.saleId, amount: 100_000, note: "Too big" });
  expect(saved.items).toMatchObject([
    { saleItemId: sale.lineOf(tote), quantity: 2, amount: 100_000 },
  ]);
  const line = await db.saleItem.findUniqueOrThrow({ where: { id: sale.lineOf(tote) } });
  expect(line.refundedQuantity).toBe(2);
});

test("[FR-039] a discounted sale refunds the share paid, and all refunds add up to exactly its total", async () => {
  await signInAs("STAFF");
  // ₱333.33 × 3 = ₱999.99 less 10% = ₱899.99: shares don't divide evenly.
  const scarf = await makeProduct(categoryId, { sellingPrice: 33_333, stockQuantity: 5 });
  const sale = await sell([[scarf, 3]], { discount: { type: "PERCENT", value: 1_000 } });
  expect(sale.total).toBe(89_999);

  const amounts: number[] = [];
  for (let i = 0; i < 3; i++) {
    amounts.push(unwrap(await refund(sale.saleId, [[sale.lineOf(scarf), 1]])).amount);
  }

  expect(amounts).toEqual([30_000, 29_999, 30_000]);
  expect(amounts.reduce((a, b) => a + b, 0)).toBe(sale.total);
  expect(await stockOf(scarf.id)).toBe(5);
  const detail = unwrap(await getSale(sale.saleId));
  expect(detail).toMatchObject({ refundState: "FULL", refundedAmount: sale.total });
});

test("[FR-039] refund shares always sum to the sale total, whatever the order", () => {
  const sale = { subtotal: 100_001, total: 77_777 };
  const lines = [
    { unitPrice: 33_333, quantity: 2 },
    { unitPrice: 11_111, quantity: 3 },
    { unitPrice: 2, quantity: 1 },
  ];
  expect(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)).toBe(sale.subtotal);
  for (const order of [
    [0, 1, 2],
    [2, 1, 0],
    [1, 2, 0],
  ]) {
    const done: typeof lines = [];
    let returned = 0;
    for (const index of order) {
      const [amount] = refundAmounts(sale, done, [lines[index]]);
      expect(amount).toBeGreaterThanOrEqual(0);
      returned += amount;
      done.push(lines[index]);
    }
    expect(returned).toBe(sale.total);
  }
});

test("[FR-039] a line whose product was deleted is refunded in money only", async () => {
  await signInAs("OWNER");
  const gone = await makeProduct(categoryId, { sellingPrice: 20_000, stockQuantity: 4 });
  const kept = await makeProduct(categoryId, { sellingPrice: 10_000, stockQuantity: 4 });
  const sale = await sell([
    [gone, 1],
    [kept, 1],
  ]);
  const goneLine = sale.lineOf(gone);
  unwrap(await deleteProduct({ id: gone.id }));

  const result = unwrap(
    await refund(sale.saleId, [
      [goneLine, 1],
      [sale.lineOf(kept), 1],
    ]),
  );

  expect(result.amount).toBe(30_000);
  expect(await stockOf(kept.id)).toBe(4);
  const logged = await db.inventoryChange.findMany({ where: { refundId: result.id } });
  expect(logged.map((c) => c.productId)).toEqual([kept.id]);
  const detail = unwrap(await getSale(sale.saleId));
  expect(detail.items.find((i) => i.id === goneLine)).toMatchObject({
    productId: null,
    refundedQuantity: 1,
  });
});

test("[FR-040] a line can't be refunded for more than was sold, even across several refunds", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { name: "Canvas Tote", stockQuantity: 10 });
  const sale = await sell([[tote, 2]]);

  const tooMany = await refund(sale.saleId, [[sale.lineOf(tote), 3]]);
  expect(tooMany.ok).toBe(false);
  if (!tooMany.ok) {
    expect(tooMany.error.code).toBe("CONFLICT");
    expect(tooMany.error.fieldErrors?.[`item-${sale.lineOf(tote)}`]).toEqual([
      "Only 2 of Canvas Tote can still be refunded.",
    ]);
  }

  unwrap(await refund(sale.saleId, [[sale.lineOf(tote), 1]]));
  const second = await refund(sale.saleId, [[sale.lineOf(tote), 2]]);
  expect(second.ok).toBe(false);
  unwrap(await refund(sale.saleId, [[sale.lineOf(tote), 1]]));
  const third = await refund(sale.saleId, [[sale.lineOf(tote), 1]]);
  expect(third.ok).toBe(false);
  if (!third.ok) {
    expect(third.error.fieldErrors?.[`item-${sale.lineOf(tote)}`]).toEqual([
      "Canvas Tote has already been fully refunded.",
    ]);
  }

  // Refused refunds changed nothing: exactly the 2 sold came back.
  expect(await stockOf(tote.id)).toBe(10);
  expect(await db.refund.count()).toBe(2);
  const line = await db.saleItem.findUniqueOrThrow({ where: { id: sale.lineOf(tote) } });
  expect(line.refundedQuantity).toBe(2);
});

test("[FR-040] two refunds of the same line at the same moment can't together exceed what was sold", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { stockQuantity: 10 });
  const sale = await sell([[tote, 3]]);

  const results = await Promise.all([
    refund(sale.saleId, [[sale.lineOf(tote), 2]]),
    refund(sale.saleId, [[sale.lineOf(tote), 2]]),
  ]);

  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(await stockOf(tote.id)).toBe(9);
  const line = await db.saleItem.findUniqueOrThrow({ where: { id: sale.lineOf(tote) } });
  expect(line.refundedQuantity).toBe(2);
});

test("[FR-040] refunds reject items from another sale, repeated items, and zero or fractional quantities", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { stockQuantity: 10 });
  const first = await sell([[tote, 2]]);
  const other = await sell([[tote, 2]]);

  const foreign = await refund(first.saleId, [[other.lineOf(tote), 1]]);
  expect(foreign.ok).toBe(false);
  if (!foreign.ok) {
    expect(foreign.error.fieldErrors?.[`item-${other.lineOf(tote)}`]).toEqual([
      "This item isn't part of this sale.",
    ]);
  }
  for (const items of [
    [
      [first.lineOf(tote), 1],
      [first.lineOf(tote), 1],
    ],
    [[first.lineOf(tote), 0]],
    [[first.lineOf(tote), 1.5]],
    [],
  ] as [string, number][][]) {
    const result = await refund(first.saleId, items);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  }
  const missingSale = await refund(randomUUID(), [[first.lineOf(tote), 1]]);
  expect(!missingSale.ok && missingSale.error.code).toBe("NOT_FOUND");

  expect(await db.refund.count()).toBe(0);
  expect(await stockOf(tote.id)).toBe(6);
});

test("[FR-012-REFUND] each refunded product gets a REFUND history entry linked to the sale and refund", async () => {
  const staff = await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { name: "Canvas Tote", code: "TOTE-1" });
  const fan = await makeProduct(categoryId, { name: "Pandan Fan", code: "FAN-1" });
  const sale = await sell([
    [tote, 2],
    [fan, 3],
  ]);
  const occurredAt = "2026-09-20T02:30:00.000Z";

  const result = unwrap(
    await refund(
      sale.saleId,
      [
        [sale.lineOf(tote), 1],
        [sale.lineOf(fan), 3],
      ],
      { occurredAt, note: "Customer changed mind" },
    ),
  );

  const changes = await db.inventoryChange.findMany({
    where: { type: "REFUND" },
    orderBy: { productCode: "asc" },
  });
  expect(
    changes.map((c) => ({
      productId: c.productId,
      productName: c.productName,
      productCode: c.productCode,
      quantityChange: c.quantityChange,
      stockAfter: c.stockAfter,
      saleId: c.saleId,
      refundId: c.refundId,
      userId: c.userId,
      note: c.note,
      occurredAt: c.occurredAt.toISOString(),
    })),
  ).toEqual([
    {
      productId: fan.id,
      productName: "Pandan Fan",
      productCode: "FAN-1",
      quantityChange: 3,
      stockAfter: 10,
      saleId: sale.saleId,
      refundId: result.id,
      userId: staff.id,
      note: "Customer changed mind",
      occurredAt,
    },
    {
      productId: tote.id,
      productName: "Canvas Tote",
      productCode: "TOTE-1",
      quantityChange: 1,
      stockAfter: 9,
      saleId: sale.saleId,
      refundId: result.id,
      userId: staff.id,
      note: "Customer changed mind",
      occurredAt,
    },
  ]);
  const saved = await db.refund.findUniqueOrThrow({ where: { id: result.id } });
  expect(saved.occurredAt.toISOString()).toBe(occurredAt);
});

test("[REFUND-IDEMPOTENT] replaying the same refund id returns the first result without refunding twice", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { sellingPrice: 50_000, stockQuantity: 10 });
  const sale = await sell([[tote, 3]]);
  const command: RefundSaleInput = {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    saleId: sale.saleId,
    items: [{ saleItemId: sale.lineOf(tote), quantity: 1 }],
  };

  const first = unwrap(await refundSale(command));
  const [second, third] = await Promise.all([refundSale(command), refundSale(command)]);

  expect(first).toMatchObject({ amount: 50_000, itemCount: 1, replayed: false });
  expect(unwrap(second)).toMatchObject({ id: first.id, amount: 50_000, replayed: true });
  expect(unwrap(third)).toMatchObject({ id: first.id, amount: 50_000, replayed: true });
  expect(await stockOf(tote.id)).toBe(8);
  expect(await db.refund.count()).toBe(1);
  expect(await db.inventoryChange.count({ where: { type: "REFUND" } })).toBe(1);
  const line = await db.saleItem.findUniqueOrThrow({ where: { id: sale.lineOf(tote) } });
  expect(line.refundedQuantity).toBe(1);
});

test("[REFUND-STAFF] staff can list sales, open one, and refund it; signed-out users can't", async () => {
  const owner = await signInAs("OWNER");
  const tote = await makeProduct(categoryId, { sellingPrice: 50_000, purchasePrice: 30_000 });
  const ownerSale = await sell([[tote, 2]], { customerInfo: "Maria, 0917" });

  const staff = await signInAs("STAFF");
  const list = unwrap(await listSales());
  expect(list.items).toHaveLength(1);
  expect(list.items[0]).toMatchObject({
    id: ownerSale.saleId,
    staffName: owner.name,
    refundState: "NONE",
  });
  expect(unwrap(await listSales({ q: "maria" })).total).toBe(1);
  expect(unwrap(await listSales({ q: "nobody" })).total).toBe(0);

  const detail = unwrap(await getSale(ownerSale.saleId));
  // Purchase cost is owner-only (FR-042) and never reaches the sales pages.
  expect(JSON.stringify(detail)).not.toContain("unitCost");
  expect(JSON.stringify(detail)).not.toContain("30000");

  const result = unwrap(await refund(ownerSale.saleId, [[ownerSale.lineOf(tote), 1]]));
  const saved = await db.refund.findUniqueOrThrow({ where: { id: result.id } });
  expect(saved.userId).toBe(staff.id);
  expect(unwrap(await listSales()).items[0]).toMatchObject({
    refundState: "PARTIAL",
    refundedAmount: 50_000,
  });

  session.current = null;
  const anonymous = await refund(ownerSale.saleId, [[ownerSale.lineOf(tote), 1]]);
  expect(!anonymous.ok && anonymous.error.code).toBe("UNAUTHORIZED");
  expect((await listSales()).ok).toBe(false);
  expect((await getSale(ownerSale.saleId)).ok).toBe(false);
  expect(await db.refund.count()).toBe(1);
});

test("[REFUND-STAFF] a sale id that isn't a UUID is simply not found", async () => {
  await signInAs("STAFF");
  const result = await getSale("not-a-uuid");
  expect(!result.ok && result.error.code).toBe("NOT_FOUND");
});
