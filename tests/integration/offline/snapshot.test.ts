// The device snapshot (FR-055, leaf 9.1): everything the user may see on the first sync, only
// changes afterwards, and never owner data for staff.
import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { deviceSnapshot } from "@/app/api/catalog/device-snapshot";
import { deleteCategory } from "@/features/categories/actions";
import { archiveProduct } from "@/features/products/actions";
import { refundSale } from "@/features/refunds/actions";
import { recordSale } from "@/features/sales/actions";
import { deleteSupplier } from "@/features/suppliers/actions";
import { db } from "@/lib/db";
import type { Snapshot } from "@/lib/offline/snapshot";
import type { Result } from "@/lib/result";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request, and revalidatePath needs Next's request store.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

function actAs(user: { id: string }) {
  session.current = { user: { id: user.id } };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

/**
 * A small shop: an owner and a staff member, two categories (one empty), two suppliers (one
 * unused), a product with a cost and supplier, an archived product, a sale and a refund.
 */
async function seedShop() {
  const owner = await makeUser("OWNER", `owner-${randomUUID().slice(0, 6)}@test.local`);
  const staff = await makeUser("STAFF");
  const bags = await makeCategory("Bags");
  const empty = await makeCategory("Empty Shelf");
  const supplier = await db.supplier.create({
    data: { name: "Samar Weavers Coop", phone: "0917 000 0000" },
  });
  const spare = await db.supplier.create({ data: { name: "Spare Supplier" } });
  const tote = await db.product.update({
    where: { id: (await makeProduct(bags.id, { name: "Banig Tote", code: "TOTE-1" })).id },
    data: { supplierId: supplier.id, purchasePrice: 12_345 },
  });
  const fan = await makeProduct(bags.id, { name: "Pandan Fan", code: "FAN-1" });
  const old = await makeProduct(bags.id, { name: "Old Basket", code: "OLD-1" });

  actAs(owner);
  unwrap(await archiveProduct({ id: old.id }));
  actAs(staff);
  const sale = unwrap(
    await recordSale({
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      items: [
        { productId: tote.id, quantity: 2, unitPrice: tote.sellingPrice },
        { productId: fan.id, quantity: 1, unitPrice: fan.sellingPrice },
      ],
      paymentMethod: "CASH",
    }),
  );
  const toteLine = await db.saleItem.findFirstOrThrow({
    where: { saleId: sale.id, productId: tote.id },
  });
  const refund = unwrap(
    await refundSale({
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      saleId: sale.id,
      items: [{ saleItemId: toteLine.id, quantity: 1, returnToStock: true }],
      note: "Wrong colour",
    }),
  );
  return { owner, staff, bags, empty, supplier, spare, tote, fan, old, sale, refund };
}

/** Moves every existing row an hour into the past, so only later changes count as new. */
async function ageEverything() {
  for (const [table, column] of [
    ["Product", "updatedAt"],
    ["Category", "updatedAt"],
    ["Supplier", "updatedAt"],
    ["User", "updatedAt"],
    ["Sale", "recordedAt"],
    ["Refund", "recordedAt"],
    ["InventoryChange", "recordedAt"],
  ]) {
    await db.$executeRawUnsafe(
      `update "${table}" set "${column}" = "${column}" - interval '1 hour'`,
    );
  }
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

test("[FR-055] the owner's first snapshot holds every table: products (archived too), categories, suppliers, users, sales, refunds, history", async () => {
  const shop = await seedShop();
  actAs(shop.owner);

  const snap = unwrap(await deviceSnapshot({}));

  expect(snap.full).toBe(true);
  expect(snap.user).toEqual({ id: shop.owner.id, role: "OWNER" });
  expect(Date.parse(snap.cursor)).not.toBeNaN();

  expect(ids(snap.products)).toEqual(ids([shop.tote, shop.fan, shop.old]));
  const tote = snap.products.find((p) => p.id === shop.tote.id);
  expect(tote).toMatchObject({
    name: "Banig Tote",
    categoryId: shop.bags.id,
    categoryName: "Bags",
    supplierId: shop.supplier.id,
    purchasePrice: 12_345,
    stockQuantity: 9, // 10 - 2 sold + 1 refunded
    archivedAt: null,
  });
  expect(snap.products.find((p) => p.id === shop.old.id)?.archivedAt).not.toBeNull();

  expect(ids(snap.categories)).toEqual(ids([shop.bags, shop.empty]));
  expect(snap.categoryIds.sort()).toEqual(ids([shop.bags, shop.empty]));
  expect(ids(snap.suppliers)).toEqual(ids([shop.supplier, shop.spare]));
  expect(snap.supplierIds.sort()).toEqual(ids([shop.supplier, shop.spare]));
  expect(ids(snap.users)).toEqual(ids([shop.owner, shop.staff]));
  expect(snap.userIds.sort()).toEqual(ids([shop.owner, shop.staff]));
  for (const user of snap.users) {
    expect(Object.keys(user).sort()).toEqual(
      ["active", "createdAt", "email", "id", "name", "role", "updatedAt"].sort(),
    );
  }

  expect(snap.sales).toHaveLength(1);
  const sale = snap.sales[0]!;
  expect(sale).toMatchObject({ id: shop.sale.id, staffId: shop.staff.id, staffName: "Test Staff" });
  expect(sale.items).toHaveLength(2);
  const toteLine = sale.items.find((i) => i.productId === shop.tote.id);
  expect(toteLine).toMatchObject({ quantity: 2, unitCost: 12_345, refundedQuantity: 1 });

  expect(snap.refunds).toHaveLength(1);
  expect(snap.refunds[0]).toMatchObject({
    id: shop.refund.id,
    saleId: shop.sale.id,
    userName: "Test Staff",
    note: "Wrong colour",
  });
  expect(snap.refunds[0]!.items).toEqual([
    expect.objectContaining({ saleItemId: toteLine!.id, quantity: 1, returnedToStock: true }),
  ]);

  const history = await db.inventoryChange.findMany({ select: { id: true } });
  expect(ids(snap.inventoryChanges)).toEqual(ids(history));
  expect(snap.inventoryChanges.map((c) => c.type).sort()).toEqual(
    ["ARCHIVE", "REFUND", "SALE", "SALE"].sort(),
  );
  expect(snap.inventoryChanges.every((c) => typeof c.userName === "string")).toBe(true);
});

test("[FR-055-STAFF-SCOPE] a staff snapshot never holds purchase prices, costs, suppliers, or user accounts", async () => {
  const shop = await seedShop();
  actAs(shop.staff);

  // Even a device that claims to hold the owner's data gets the staff scope.
  const snaps = [
    unwrap(await deviceSnapshot({})),
    unwrap(await deviceSnapshot({ user: shop.owner.id, role: "OWNER" })),
  ];
  for (const snap of snaps) {
    expect(snap.user).toEqual({ id: shop.staff.id, role: "STAFF" });
    expect(snap.products).toHaveLength(3);
    for (const product of snap.products) {
      expect(product.purchasePrice).toBeNull();
      expect(product.supplierId).toBeNull();
    }
    expect(snap.sales).toHaveLength(1);
    expect(snap.sales[0]!.items.every((item) => item.unitCost === null)).toBe(true);
    expect(snap.suppliers).toEqual([]);
    expect(snap.supplierIds).toEqual([]);
    expect(snap.users).toEqual([]);
    expect(snap.userIds).toEqual([]);

    // Nothing owner-only hides anywhere else in the reply either.
    const text = JSON.stringify(snap);
    for (const secret of [
      "12345",
      shop.supplier.id,
      "Samar Weavers Coop",
      "0917 000 0000",
      shop.owner.email,
      "passwordHash",
      "sessionVersion",
    ]) {
      expect(text).not.toContain(secret);
    }
  }

  // The staff member still sees everything a staff member may: refunds and full history.
  expect(snaps[0]!.refunds).toHaveLength(1);
  expect(snaps[0]!.inventoryChanges).toHaveLength(4);
  expect(ids(snaps[0]!.categories)).toEqual(ids([shop.bags, shop.empty]));

  session.current = null;
  expect(await deviceSnapshot({})).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
});

test("[FR-055-INCREMENTAL] after the first sync only what changed is sent, including archived products and deleted categories or suppliers", async () => {
  const shop = await seedShop();
  await ageEverything();
  actAs(shop.owner);
  const first: Snapshot = unwrap(await deviceSnapshot({}));
  const since = { since: first.cursor, user: shop.owner.id, role: "OWNER" };

  // Nothing changed: nothing but the lists of ids that still exist.
  const quiet = unwrap(await deviceSnapshot(since));
  expect(quiet.full).toBe(false);
  for (const rows of [
    quiet.products,
    quiet.categories,
    quiet.suppliers,
    quiet.users,
    quiet.sales,
    quiet.refunds,
    quiet.inventoryChanges,
  ]) {
    expect(rows).toEqual([]);
  }
  expect(quiet.categoryIds.sort()).toEqual(ids([shop.bags, shop.empty]));
  expect(quiet.supplierIds.sort()).toEqual(ids([shop.supplier, shop.spare]));

  // Changes: archive a product, rename another, delete a category and a supplier, sell, and
  // refund part of the older sale.
  unwrap(await archiveProduct({ id: shop.fan.id }));
  await db.product.update({ where: { id: shop.tote.id }, data: { name: "Banig Tote XL" } });
  unwrap(await deleteCategory({ id: shop.empty.id }));
  unwrap(await deleteSupplier({ id: shop.spare.id }));
  actAs(shop.staff);
  const fresh = await makeProduct(shop.bags.id, { name: "Capiz Earrings", code: "EAR-1" });
  const newSale = unwrap(
    await recordSale({
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      items: [{ productId: fresh.id, quantity: 1, unitPrice: fresh.sellingPrice }],
      paymentMethod: "GCASH",
    }),
  );
  const fanLine = await db.saleItem.findFirstOrThrow({
    where: { saleId: shop.sale.id, productId: shop.fan.id },
  });
  const newRefund = unwrap(
    await refundSale({
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      saleId: shop.sale.id,
      items: [{ saleItemId: fanLine.id, quantity: 1, returnToStock: false }],
      note: "Damaged",
    }),
  );

  actAs(shop.owner);
  const next = unwrap(await deviceSnapshot(since));
  expect(next.full).toBe(false);
  expect(Date.parse(next.cursor)).toBeGreaterThan(Date.parse(first.cursor));

  expect(ids(next.products)).toEqual(ids([shop.fan, shop.tote, fresh]));
  expect(next.products.find((p) => p.id === shop.fan.id)?.archivedAt).not.toBeNull();
  expect(next.products.find((p) => p.id === shop.tote.id)?.name).toBe("Banig Tote XL");
  expect(next.products.some((p) => p.id === shop.old.id)).toBe(false);

  expect(next.categories).toEqual([]);
  expect(next.categoryIds).toEqual([shop.bags.id]);
  expect(next.suppliers).toEqual([]);
  expect(next.supplierIds).toEqual([shop.supplier.id]);

  // The new sale, and the old one again because its refunded quantities changed.
  expect(ids(next.sales)).toEqual(ids([shop.sale, newSale]));
  const old = next.sales.find((s) => s.id === shop.sale.id);
  expect(old?.items.find((i) => i.id === fanLine.id)?.refundedQuantity).toBe(1);
  expect(ids(next.refunds)).toEqual([newRefund.id]);
  expect(next.inventoryChanges.map((c) => c.type).sort()).toEqual(
    ["ARCHIVE", "REFUND", "SALE"].sort(),
  );
  expect(
    next.inventoryChanges.every(
      (c) => Date.parse(c.recordedAt) > Date.parse(first.cursor) - 60_000,
    ),
  ).toBe(true);

  // A cursor from another user, another role, or the future gets everything again.
  for (const query of [
    { ...since, user: shop.staff.id },
    { ...since, role: "STAFF" },
    { ...since, since: new Date(Date.now() + 3_600_000).toISOString() },
    { ...since, since: "not a date" },
  ]) {
    const again = unwrap(await deviceSnapshot(query));
    expect(again.full).toBe(true);
    expect(again.products).toHaveLength(4);
  }
});
