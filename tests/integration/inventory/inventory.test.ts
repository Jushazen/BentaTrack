import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { restockProduct } from "@/features/inventory/actions";
import { listInventoryChanges } from "@/features/inventory/queries";
import { deleteProduct } from "@/features/products/actions";
import { db } from "@/lib/db";
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

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function restock(productId: string, quantity: number, extra: Record<string, unknown> = {}) {
  return restockProduct({
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    productId,
    quantity,
    ...extra,
  });
}

let categoryId: string;

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
  categoryId = (await makeCategory("Bags")).id;
});

test("[FR-038] staff restock adds the received quantity to stock", async () => {
  await signInAs("STAFF");
  const product = await makeProduct(categoryId, { name: "Canvas Tote", stockQuantity: 3 });

  const result = unwrap(await restock(product.id, 12, { note: "Delivery from Manila" }));

  expect(result).toMatchObject({ productName: "Canvas Tote", quantity: 12, stockAfter: 15 });
  const after = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(after.stockQuantity).toBe(15);
});

test("[FR-038] replaying the same restock id does not add stock twice", async () => {
  await signInAs("STAFF");
  const product = await makeProduct(categoryId, { stockQuantity: 2 });
  const command = {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    productId: product.id,
    quantity: 5,
  };

  const first = unwrap(await restockProduct(command));
  const [second, third] = await Promise.all([restockProduct(command), restockProduct(command)]);

  expect(first.replayed).toBe(false);
  expect(unwrap(second)).toMatchObject({ id: first.id, stockAfter: 7, replayed: true });
  expect(unwrap(third)).toMatchObject({ id: first.id, stockAfter: 7, replayed: true });
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(7);
  expect(await db.inventoryChange.count({ where: { type: "RESTOCK" } })).toBe(1);
});

test("[FR-038-INVALID] restock rejects zero, negative, fractional, and oversized quantities", async () => {
  await signInAs("STAFF");
  const product = await makeProduct(categoryId, { stockQuantity: 4 });

  for (const quantity of [0, -3, 2.5, Number.NaN, 10_001]) {
    const result = await restock(product.id, quantity);
    expect(result, `quantity ${quantity}`).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { quantity: expect.any(Array) } },
    });
  }
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(4);
  expect(await db.inventoryChange.count()).toBe(0);
});

test("[FR-038-INVALID] restock refuses bad ids, future times, missing products, and stock overflow", async () => {
  await signInAs("OWNER");
  const product = await makeProduct(categoryId, { stockQuantity: 999_995 });

  expect(await restock(product.id, 1, { id: "not-a-uuid" })).toMatchObject({
    ok: false,
    error: { code: "VALIDATION" },
  });
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  expect(await restock(product.id, 1, { occurredAt: future })).toMatchObject({
    ok: false,
    error: { code: "VALIDATION" },
  });
  expect(await restock("missing-product", 1)).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  expect(await restock(product.id, 6)).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", fieldErrors: { quantity: expect.any(Array) } },
  });
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(
    999_995,
  );
  expect(await db.inventoryChange.count()).toBe(0);
});

test("[FR-038-INVALID] restock requires a signed-in user", async () => {
  const product = await makeProduct(categoryId, { stockQuantity: 1 });
  expect(await restock(product.id, 5)).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(1);
});

test("[FR-010] a restock is logged with the date and time it happened", async () => {
  await signInAs("STAFF");
  const product = await makeProduct(categoryId, { stockQuantity: 0 });
  // Recorded offline an hour ago and replayed now: the log keeps the original time.
  const occurredAt = new Date(Date.now() - 60 * 60 * 1000);
  const { id } = unwrap(await restock(product.id, 3, { occurredAt: occurredAt.toISOString() }));

  const change = await db.inventoryChange.findUniqueOrThrow({ where: { id } });
  expect(change.occurredAt.toISOString()).toBe(occurredAt.toISOString());
  expect(change.recordedAt.getTime()).toBeGreaterThanOrEqual(occurredAt.getTime());
});

test("[FR-011] a restock records the product, user, change, and stock after", async () => {
  const staff = await signInAs("STAFF");
  const product = await makeProduct(categoryId, {
    name: "Rattan Clutch",
    code: "RC-01",
    stockQuantity: 2,
  });
  const { id } = unwrap(await restock(product.id, 8, { note: "  From Cebu supplier  " }));

  const change = await db.inventoryChange.findUniqueOrThrow({ where: { id } });
  expect(change).toMatchObject({
    productId: product.id,
    productName: "Rattan Clutch",
    productCode: "RC-01",
    type: "RESTOCK",
    quantityChange: 8,
    stockAfter: 10,
    userId: staff.id,
    note: "From Cebu supplier",
  });
});

test("[FR-012-RESTOCK] history lists a product's restocks newest first and survives deletion", async () => {
  const owner = await signInAs("OWNER");
  const product = await makeProduct(categoryId, { name: "Beaded Pouch", code: "BP-7" });
  const other = await makeProduct(categoryId, { name: "Straw Hat", code: "SH-1" });
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  unwrap(await restock(product.id, 4, { occurredAt: hourAgo }));
  unwrap(await restock(product.id, 6));
  unwrap(await restock(other.id, 1));

  const forProduct = unwrap(await listInventoryChanges({ product: product.id }));
  expect(forProduct.productLabel).toEqual({ name: "Beaded Pouch", code: "BP-7" });
  expect(forProduct.items.map((e) => [e.type, e.quantityChange, e.stockAfter])).toEqual([
    ["RESTOCK", 6, 20],
    ["RESTOCK", 4, 14],
  ]);
  expect(forProduct.items[0]?.userName).toBe(owner.name);

  expect(unwrap(await listInventoryChanges({ type: "RESTOCK" })).total).toBe(3);
  expect(unwrap(await listInventoryChanges({ q: "sh-1" })).items).toHaveLength(1);

  // Deleting the product keeps its history, found by the name snapshot.
  unwrap(await deleteProduct({ id: product.id }));
  const afterDelete = unwrap(await listInventoryChanges({ q: "beaded" }));
  expect(afterDelete.items.map((e) => e.type)).toEqual(["REMOVAL", "RESTOCK", "RESTOCK"]);
  expect(afterDelete.items.every((e) => e.productId === null)).toBe(true);
});

test("[FR-012-RESTOCK] staff can read history; malformed filters are ignored", async () => {
  await signInAs("STAFF");
  const product = await makeProduct(categoryId);
  unwrap(await restock(product.id, 2));

  const page = unwrap(await listInventoryChanges({ type: "NOPE", page: "-4", q: ["a", "b"] }));
  expect(page.filters).toEqual({});
  expect(page.total).toBe(1);

  session.current = null;
  expect(await listInventoryChanges()).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
});
