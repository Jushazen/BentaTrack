import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { recordSale, type SaleResult } from "@/features/sales/actions";
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

function sale(
  lines: [Line, number][],
  extra: Partial<RecordSaleInput> = {},
): Promise<Result<SaleResult>> {
  return recordSale({
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    items: lines.map(([product, quantity]) => ({
      productId: product.id,
      quantity,
      unitPrice: product.sellingPrice,
    })),
    paymentMethod: "CASH",
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

test("[FR-013] a sale records every product and the quantity sold of each", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { name: "Canvas Tote", code: "TOTE-1" });
  const fan = await makeProduct(categoryId, { name: "Pandan Fan", code: "FAN-1" });

  const result = unwrap(
    await sale([
      [tote, 2],
      [fan, 3],
    ]),
  );

  expect(result.itemCount).toBe(5);
  const items = await db.saleItem.findMany({
    where: { saleId: result.id },
    orderBy: { productCode: "asc" },
  });
  expect(items.map((i) => [i.productId, i.productName, i.productCode, i.quantity])).toEqual([
    [fan.id, "Pandan Fan", "FAN-1", 3],
    [tote.id, "Canvas Tote", "TOTE-1", 2],
  ]);
});

test("[FR-014] a sale records unit prices, cost, subtotal, total, and the date and time", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { sellingPrice: 25_000, purchasePrice: 15_000 });
  const noCost = await makeProduct(categoryId, { sellingPrice: 9_950, purchasePrice: null });
  const occurredAt = new Date(Date.now() - 60_000);

  const result = unwrap(
    await sale(
      [
        [tote, 2],
        [noCost, 1],
      ],
      { occurredAt: occurredAt.toISOString() },
    ),
  );

  expect(result).toMatchObject({ subtotal: 59_950, discountAmount: 0, total: 59_950 });
  const saved = await db.sale.findUniqueOrThrow({
    where: { id: result.id },
    include: { items: true },
  });
  expect(saved.occurredAt.toISOString()).toBe(occurredAt.toISOString());
  expect(saved.recordedAt.getTime()).toBeGreaterThanOrEqual(occurredAt.getTime());
  expect(saved).toMatchObject({ subtotal: 59_950, discountAmount: 0, total: 59_950 });
  const byProduct = new Map(saved.items.map((i) => [i.productId, i]));
  expect(byProduct.get(tote.id)).toMatchObject({ unitPrice: 25_000, unitCost: 15_000 });
  expect(byProduct.get(noCost.id)).toMatchObject({ unitPrice: 9_950, unitCost: null });
});

test("[FR-015] a sale records the staff member who processed it", async () => {
  const staff = await signInAs("STAFF");
  const tote = await makeProduct(categoryId);
  const result = unwrap(await sale([[tote, 1]]));
  const saved = await db.sale.findUniqueOrThrow({ where: { id: result.id } });
  expect(saved.staffId).toBe(staff.id);

  const owner = await signInAs("OWNER");
  const second = unwrap(await sale([[tote, 1]]));
  expect((await db.sale.findUniqueOrThrow({ where: { id: second.id } })).staffId).toBe(owner.id);
});

test("[FR-016] customer information is optional free text", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId);

  const withCustomer = unwrap(
    await sale([[tote, 1]], { customerInfo: "  Ana Cruz, 0917 123 4567 " }),
  );
  const without = unwrap(await sale([[tote, 1]], { customerInfo: "   " }));
  const omitted = unwrap(await sale([[tote, 1]]));

  const info = async (id: string) =>
    (await db.sale.findUniqueOrThrow({ where: { id } })).customerInfo;
  expect(await info(withCustomer.id)).toBe("Ana Cruz, 0917 123 4567");
  expect(await info(without.id)).toBeNull();
  expect(await info(omitted.id)).toBeNull();

  const tooLong = await sale([[tote, 1]], { customerInfo: "x".repeat(201) });
  expect(tooLong.ok).toBe(false);
  if (!tooLong.ok) expect(tooLong.error.fieldErrors?.customerInfo).toBeDefined();
});

test("[FR-017] a whole-sale discount can be a peso amount or a percentage", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { sellingPrice: 25_000, stockQuantity: 20 });

  const amount = unwrap(await sale([[tote, 2]], { discount: { type: "AMOUNT", value: 5_000 } }));
  expect(amount).toMatchObject({ subtotal: 50_000, discountAmount: 5_000, total: 45_000 });
  expect(await db.sale.findUniqueOrThrow({ where: { id: amount.id } })).toMatchObject({
    discountType: "AMOUNT",
    discountValue: 5_000,
    discountAmount: 5_000,
    total: 45_000,
  });

  // 12.5% of ₱500 = ₱62.50
  const percent = unwrap(await sale([[tote, 2]], { discount: { type: "PERCENT", value: 1_250 } }));
  expect(percent).toMatchObject({ subtotal: 50_000, discountAmount: 6_250, total: 43_750 });
  expect(await db.sale.findUniqueOrThrow({ where: { id: percent.id } })).toMatchObject({
    discountType: "PERCENT",
    discountValue: 1_250,
  });

  const none = unwrap(await sale([[tote, 1]], { discount: { type: "AMOUNT", value: 0 } }));
  expect(await db.sale.findUniqueOrThrow({ where: { id: none.id } })).toMatchObject({
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    total: 25_000,
  });

  const overHundred = await sale([[tote, 1]], { discount: { type: "PERCENT", value: 10_001 } });
  expect(overHundred.ok).toBe(false);
  const negative = await sale([[tote, 1]], { discount: { type: "AMOUNT", value: -1 } });
  expect(negative.ok).toBe(false);
});

test("[FR-017-CAP] a discount larger than the subtotal is capped at the subtotal", async () => {
  await signInAs("STAFF");
  const fan = await makeProduct(categoryId, { sellingPrice: 9_950 });
  const result = unwrap(await sale([[fan, 1]], { discount: { type: "AMOUNT", value: 50_000 } }));
  expect(result).toMatchObject({ subtotal: 9_950, discountAmount: 9_950, total: 0 });
  const saved = await db.sale.findUniqueOrThrow({ where: { id: result.id } });
  expect(saved).toMatchObject({ discountAmount: 9_950, total: 0 });
});

test("[FR-018] the payment method is recorded as Cash or GCash", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId);
  const cash = unwrap(await sale([[tote, 1]], { paymentMethod: "CASH" }));
  const gcash = unwrap(await sale([[tote, 1]], { paymentMethod: "GCASH" }));
  expect(cash.paymentMethod).toBe("CASH");
  expect(gcash.paymentMethod).toBe("GCASH");
  expect((await db.sale.findUniqueOrThrow({ where: { id: gcash.id } })).paymentMethod).toBe(
    "GCASH",
  );
});

test("[FR-019] card and other payment methods are refused and nothing is recorded", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { stockQuantity: 5 });
  for (const method of ["CARD", "CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER", ""]) {
    const result = await sale([[tote, 1]], {
      paymentMethod: method as RecordSaleInput["paymentMethod"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.fieldErrors?.paymentMethod).toEqual(["Choose Cash or GCash."]);
    }
  }
  expect(await db.sale.count()).toBe(0);
  expect(await stockOf(tote.id)).toBe(5);
});

test("[FR-005] a sale reduces each product's stock by the quantity sold", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { stockQuantity: 10 });
  const fan = await makeProduct(categoryId, { stockQuantity: 4 });
  unwrap(
    await sale([
      [tote, 3],
      [fan, 4],
    ]),
  );
  expect(await stockOf(tote.id)).toBe(7);
  expect(await stockOf(fan.id)).toBe(0);
});

test("[FR-012-SALE] each sold item is logged as a SALE in the inventory history", async () => {
  const staff = await signInAs("STAFF");
  const tote = await makeProduct(categoryId, {
    name: "Canvas Tote",
    code: "TOTE-1",
    stockQuantity: 10,
  });
  const fan = await makeProduct(categoryId, {
    name: "Pandan Fan",
    code: "FAN-1",
    stockQuantity: 6,
  });
  const occurredAt = new Date(Date.now() - 5_000);
  const result = unwrap(
    await sale(
      [
        [tote, 3],
        [fan, 1],
      ],
      { occurredAt: occurredAt.toISOString() },
    ),
  );

  const changes = await db.inventoryChange.findMany({ orderBy: { productCode: "asc" } });
  expect(
    changes.map((c) => ({
      productId: c.productId,
      productName: c.productName,
      productCode: c.productCode,
      type: c.type,
      quantityChange: c.quantityChange,
      stockAfter: c.stockAfter,
      saleId: c.saleId,
      userId: c.userId,
      occurredAt: c.occurredAt.toISOString(),
    })),
  ).toEqual([
    {
      productId: fan.id,
      productName: "Pandan Fan",
      productCode: "FAN-1",
      type: "SALE",
      quantityChange: -1,
      stockAfter: 5,
      saleId: result.id,
      userId: staff.id,
      occurredAt: occurredAt.toISOString(),
    },
    {
      productId: tote.id,
      productName: "Canvas Tote",
      productCode: "TOTE-1",
      type: "SALE",
      quantityChange: -3,
      stockAfter: 7,
      saleId: result.id,
      userId: staff.id,
      occurredAt: occurredAt.toISOString(),
    },
  ]);
});

test("[SALE-ATOMIC] if any item can't be sold, nothing is recorded and no stock changes", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { stockQuantity: 10 });
  const fan = await makeProduct(categoryId, { stockQuantity: 1 });

  const short = await sale([
    [tote, 2],
    [fan, 2],
  ]);
  expect(short.ok).toBe(false);

  const gone = { id: "no-such-product", sellingPrice: 100 };
  const missing = await sale([
    [tote, 2],
    [gone, 1],
  ]);
  expect(missing.ok).toBe(false);
  if (!missing.ok) {
    expect(missing.error.code).toBe("NOT_FOUND");
    expect(missing.error.fieldErrors?.["item:no-such-product"]).toBeDefined();
  }

  expect(await db.sale.count()).toBe(0);
  expect(await db.saleItem.count()).toBe(0);
  expect(await db.inventoryChange.count()).toBe(0);
  expect(await stockOf(tote.id)).toBe(10);
  expect(await stockOf(fan.id)).toBe(1);
});

test("[SALE-ATOMIC] a changed price refuses the whole sale so the customer pays what was shown", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { sellingPrice: 25_000, stockQuantity: 10 });
  await db.product.update({ where: { id: tote.id }, data: { sellingPrice: 27_500 } });

  const result = await sale([[tote, 1]]);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("CONFLICT");
    expect(result.error.fieldErrors?.[`item:${tote.id}`]).toEqual([
      "The price is now ₱275.00. Remove it and add it again.",
    ]);
  }
  expect(await db.sale.count()).toBe(0);
  expect(await stockOf(tote.id)).toBe(10);
});

test("[SALE-IDEMPOTENT] replaying the same sale id returns the first result and sells once", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { stockQuantity: 10, lowStockThreshold: 5 });
  const input: RecordSaleInput = {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    items: [{ productId: tote.id, quantity: 6, unitPrice: tote.sellingPrice }],
    discount: { type: "AMOUNT", value: 1_000 },
    paymentMethod: "GCASH",
  };

  const first = unwrap(await recordSale(input));
  const again = unwrap(await recordSale(input));
  const [raceA, raceB] = await Promise.all([recordSale(input), recordSale(input)]);

  expect(first.replayed).toBe(false);
  expect(first.lowStockAlerts).toHaveLength(1);
  expect(again).toEqual({ ...first, replayed: true, lowStockAlerts: [] });
  expect(unwrap(raceA).id).toBe(first.id);
  expect(unwrap(raceB).id).toBe(first.id);
  expect(await db.sale.count()).toBe(1);
  expect(await db.inventoryChange.count()).toBe(1);
  expect(await stockOf(tote.id)).toBe(4);
});

test("[SALE-IDEMPOTENT] two different sales started at once both apply", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { stockQuantity: 10 });
  const [a, b] = await Promise.all([sale([[tote, 2]]), sale([[tote, 3]])]);
  unwrap(a);
  unwrap(b);
  expect(await db.sale.count()).toBe(2);
  expect(await stockOf(tote.id)).toBe(5);
});

test("[SALE-OVERSELL] selling more than is in stock is refused with the amount left", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { name: "Canvas Tote", stockQuantity: 2 });
  const out = await makeProduct(categoryId, { name: "Pandan Fan", stockQuantity: 0 });

  const result = await sale([
    [tote, 3],
    [out, 1],
  ]);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe("CONFLICT");
    expect(result.error.message).toBe("Not enough stock for this sale.");
    expect(result.error.fieldErrors).toEqual({
      [`item:${tote.id}`]: ["Only 2 of Canvas Tote in stock."],
      [`item:${out.id}`]: ["Pandan Fan is out of stock."],
    });
  }
  expect(await stockOf(tote.id)).toBe(2);
  expect(await stockOf(out.id)).toBe(0);
});

test("[SALE-OVERSELL] two checkouts racing for the last unit: exactly one succeeds", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId, { stockQuantity: 1 });
  const results = await Promise.all([sale([[tote, 1]]), sale([[tote, 1]]), sale([[tote, 1]])]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(await db.sale.count()).toBe(1);
  expect(await stockOf(tote.id)).toBe(0);
});

test("[FR-008] a sale reports products that just crossed into low or out of stock", async () => {
  await signInAs("STAFF");
  const low = await makeProduct(categoryId, {
    name: "Canvas Tote",
    stockQuantity: 7,
    lowStockThreshold: 5,
  });
  const out = await makeProduct(categoryId, {
    name: "Pandan Fan",
    stockQuantity: 2,
    lowStockThreshold: 5,
  });
  const fine = await makeProduct(categoryId, { name: "Abaca Bag", stockQuantity: 30 });

  const result = unwrap(
    await sale([
      [low, 3],
      [out, 2],
      [fine, 1],
    ]),
  );
  expect(result.lowStockAlerts).toEqual([
    { productId: low.id, name: "Canvas Tote", quantity: 4, threshold: 5 },
    { productId: out.id, name: "Pandan Fan", quantity: 0, threshold: 5 },
  ]);

  // Already low and staying low: no new pop-up.
  const again = unwrap(await sale([[low, 1]]));
  expect(again.lowStockAlerts).toEqual([]);
});

test("[FR-013] a sale needs at least one item, unique products, and whole positive quantities", async () => {
  await signInAs("STAFF");
  const tote = await makeProduct(categoryId);
  const cases: Partial<RecordSaleInput>[] = [
    { items: [] },
    {
      items: [
        { productId: tote.id, quantity: 1, unitPrice: tote.sellingPrice },
        { productId: tote.id, quantity: 2, unitPrice: tote.sellingPrice },
      ],
    },
    { items: [{ productId: tote.id, quantity: 0, unitPrice: tote.sellingPrice }] },
    { items: [{ productId: tote.id, quantity: 1.5, unitPrice: tote.sellingPrice }] },
    { id: "not-a-uuid" },
    { occurredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  ];
  for (const extra of cases) {
    const result = await sale([[tote, 1]], extra);
    expect(result.ok, JSON.stringify(extra)).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  }
  expect(await db.sale.count()).toBe(0);
});

test("[FR-015] recording a sale requires a signed-in user", async () => {
  const tote = await makeProduct(categoryId, { stockQuantity: 3 });
  const result = await sale([[tote, 1]]);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED");
  expect(await stockOf(tote.id)).toBe(3);
});
