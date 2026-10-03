import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/sync/route";
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

type Body = { kind: string; recordedBy: string | null; input: Record<string, unknown> };

async function sync(body: Body | string): Promise<{ status: number; result: Result<unknown> }> {
  const response = await POST(
    new Request("http://localhost/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  return { status: response.status, result: (await response.json()) as Result<unknown> };
}

function data<T>(result: Result<unknown>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data as T;
}

let categoryId: string;

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
  categoryId = (await makeCategory()).id;
});

/** A sale as the device recorded it, `minutesAgo` before now. */
function saleInput(productId: string, quantity: number, unitPrice: number, minutesAgo = 30) {
  return {
    id: randomUUID(),
    occurredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    items: [{ productId, quantity, unitPrice }],
    discount: null,
    paymentMethod: "GCASH",
    customerInfo: "Walk-in",
  };
}

test("[FR-035] an offline sale replays with the device's time and the recording user", async () => {
  const staff = await signInAs("STAFF");
  const product = await makeProduct(categoryId, { stockQuantity: 10, sellingPrice: 30_000 });
  const input = saleInput(product.id, 3, 30_000, 45);

  const { status, result } = await sync({ kind: "SALE", recordedBy: staff.id, input });

  expect(status).toBe(200);
  expect(data<{ total: number; replayed: boolean }>(result)).toMatchObject({
    total: 90_000,
    replayed: false,
  });
  const sale = await db.sale.findUniqueOrThrow({ where: { id: input.id } });
  expect(sale.occurredAt.toISOString()).toBe(input.occurredAt);
  expect(sale.staffId).toBe(staff.id);
  expect(sale.paymentMethod).toBe("GCASH");
  const change = await db.inventoryChange.findFirstOrThrow({ where: { saleId: input.id } });
  expect(change).toMatchObject({ type: "SALE", quantityChange: -3, userId: staff.id });
  expect(change.occurredAt.toISOString()).toBe(input.occurredAt);
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(7);
});

test("[FR-036] replaying the same sale, refund, or restock again never applies it twice", async () => {
  const staff = await signInAs("STAFF");
  const product = await makeProduct(categoryId, { stockQuantity: 10, sellingPrice: 20_000 });
  const saleBody = { kind: "SALE", recordedBy: staff.id, input: saleInput(product.id, 2, 20_000) };
  const restockBody = {
    kind: "RESTOCK",
    recordedBy: staff.id,
    input: {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      productId: product.id,
      quantity: 5,
    },
  };

  for (let round = 0; round < 3; round++) {
    const sold = await sync(saleBody);
    expect(data<{ replayed: boolean }>(sold.result).replayed).toBe(round > 0);
    const restocked = await sync(restockBody);
    expect(data<{ replayed: boolean }>(restocked.result).replayed).toBe(round > 0);
  }
  const line = await db.saleItem.findFirstOrThrow({ where: { saleId: saleBody.input.id } });
  const refundBody = {
    kind: "REFUND",
    recordedBy: staff.id,
    input: {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      saleId: saleBody.input.id,
      items: [{ saleItemId: line.id, quantity: 1 }],
      note: "Wrong size",
    },
  };
  // Two copies at once (e.g. two tabs replaying) still apply once.
  const copies = await Promise.all([sync(refundBody), sync(refundBody)]);
  expect(copies.map(({ result }) => data<{ replayed: boolean }>(result).replayed).sort()).toEqual([
    false,
    true,
  ]);
  await sync(refundBody);

  expect(await db.sale.count()).toBe(1);
  expect(await db.refund.count()).toBe(1);
  expect(await db.inventoryChange.count({ where: { type: "RESTOCK" } })).toBe(1);
  expect(await db.inventoryChange.count({ where: { type: "REFUND" } })).toBe(1);
  // 10 − 2 sold + 5 restocked + 1 refunded.
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(
    14,
  );
});

test("[SYNC-ORDER] a sale and its refund recorded offline sync in order; out of order the refund is refused, not lost", async () => {
  const staff = await signInAs("STAFF");
  const product = await makeProduct(categoryId, { stockQuantity: 5, sellingPrice: 10_000 });
  const saleBody = { kind: "SALE", recordedBy: staff.id, input: saleInput(product.id, 2, 10_000) };
  // The device knows the sale line only after the sale syncs, so a refund names an existing line;
  // this one refers to a sale the server hasn't seen yet.
  const refundFirst = await sync({
    kind: "REFUND",
    recordedBy: staff.id,
    input: {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      saleId: saleBody.input.id,
      items: [{ saleItemId: randomUUID(), quantity: 1 }],
      note: "Wrong size",
    },
  });
  expect(refundFirst.result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(await db.refund.count()).toBe(0);

  // In order: the sale first, then the refund of it.
  expect(data<{ replayed: boolean }>((await sync(saleBody)).result).replayed).toBe(false);
  const line = await db.saleItem.findFirstOrThrow({ where: { saleId: saleBody.input.id } });
  const refund = await sync({
    kind: "REFUND",
    recordedBy: staff.id,
    input: {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      saleId: saleBody.input.id,
      items: [{ saleItemId: line.id, quantity: 1 }],
      note: "Wrong size",
    },
  });
  expect(data<{ amount: number }>(refund.result).amount).toBe(10_000);
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(4);
});

test("[FR-036] a replay the server can't accept comes back as a refusal the device can keep", async () => {
  const staff = await signInAs("STAFF");
  const product = await makeProduct(categoryId, { stockQuantity: 1, sellingPrice: 10_000 });
  const { status, result } = await sync({
    kind: "SALE",
    recordedBy: staff.id,
    input: saleInput(product.id, 2, 10_000),
  });
  expect(status).toBe(200);
  expect(result).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: "Not enough stock for this sale." },
  });
  expect(await db.sale.count()).toBe(0);
});

test("[FR-049] only sales, refunds, and restocks are accepted; product edits need their own online action", async () => {
  const owner = await signInAs("OWNER");
  const product = await makeProduct(categoryId, { name: "Rattan Tote" });
  for (const kind of ["PRODUCT", "PRODUCT_UPDATE", "CATEGORY", "SUPPLIER", "USER", "sale"]) {
    const { status, result } = await sync({
      kind,
      recordedBy: owner.id,
      input: { id: product.id, name: "Renamed offline" },
    });
    expect(status, kind).toBe(400);
    expect(result, kind).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).name).toBe(
    "Rattan Tote",
  );
  expect(await db.inventoryChange.count()).toBe(0);

  const broken = await sync("{not json");
  expect(broken.status).toBe(400);
  expect(broken.result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
});

test("[FR-036] replays need a signed-in user, and never run under a different user than recorded them", async () => {
  const product = await makeProduct(categoryId, { stockQuantity: 10, sellingPrice: 10_000 });
  const recorder = await makeUser("STAFF");
  const body = { kind: "SALE", recordedBy: recorder.id, input: saleInput(product.id, 1, 10_000) };

  const signedOut = await sync(body);
  expect(signedOut.status).toBe(401);
  expect(signedOut.result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

  await signInAs("OWNER");
  const otherUser = await sync(body);
  expect(otherUser.status).toBe(403);
  expect(otherUser.result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  expect(await db.sale.count()).toBe(0);

  session.current = { user: { id: recorder.id } };
  expect(data<{ replayed: boolean }>((await sync(body)).result).replayed).toBe(false);
  expect((await db.sale.findUniqueOrThrow({ where: { id: body.input.id } })).staffId).toBe(
    recorder.id,
  );
});

test("[FR-034] input is still checked by the command's own schema on replay", async () => {
  const staff = await signInAs("STAFF");
  const product = await makeProduct(categoryId, { stockQuantity: 10 });
  const { result } = await sync({
    kind: "RESTOCK",
    recordedBy: staff.id,
    input: {
      id: "not-a-uuid",
      occurredAt: new Date().toISOString(),
      productId: product.id,
      quantity: -4,
    },
  });
  expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  expect(!result.ok && Object.keys(result.error.fieldErrors ?? {}).sort()).toEqual([
    "id",
    "quantity",
  ]);
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(
    10,
  );
});
