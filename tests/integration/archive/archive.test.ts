// Archiving discontinued products instead of deleting them (amendment H1: FR-004, FR-057–059).
import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { deleteCategory } from "@/features/categories/actions";
import { getDashboard } from "@/features/dashboard/queries";
import { restockProduct } from "@/features/inventory/actions";
import { listInventoryChanges } from "@/features/inventory/queries";
import {
  archiveProduct,
  createProduct,
  restoreProduct,
  updateProduct,
} from "@/features/products/actions";
import { getProduct, listProducts } from "@/features/products/queries";
import { getSalesReport } from "@/features/reports/queries";
import { catalogSnapshot, lookupProduct, searchProducts } from "@/features/search/queries";
import { recordSale } from "@/features/sales/actions";
import { deleteSupplier } from "@/features/suppliers/actions";
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

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function sell(product: { id: string; sellingPrice: number }, quantity = 1) {
  return recordSale({
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    items: [{ productId: product.id, quantity, unitPrice: product.sellingPrice }],
    paymentMethod: "CASH",
  });
}

function restock(productId: string, quantity = 5) {
  return restockProduct({
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    productId,
    quantity,
  });
}

let categoryId: string;

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
  categoryId = (await makeCategory("Perfume")).id;
});

// ---- FR-004, FR-058: archive and restore, logged, nothing deleted -------------------

test("[FR-004] archiving keeps the product and restoring brings it back exactly as it was", async () => {
  await signInAs("OWNER");
  const product = await makeProduct(categoryId, {
    name: "Rose Mist",
    code: "PF-ROSE",
    barcode: "4800000000011",
    stockQuantity: 7,
    purchasePrice: 9_000,
  });
  const before = await db.product.findUniqueOrThrow({ where: { id: product.id } });

  unwrap(await archiveProduct({ id: product.id }));
  const archived = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(archived.archivedAt).toBeInstanceOf(Date);
  expect(unwrap(await getProduct(product.id)).archived).toBe(true);

  unwrap(await restoreProduct({ id: product.id }));
  const restored = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect({ ...restored, updatedAt: before.updatedAt }).toEqual(before);
  expect(unwrap(await getProduct(product.id)).archived).toBe(false);
});

test("[FR-004] there is no way to permanently delete a product", async () => {
  const actions = await import("@/features/products/actions");
  expect(Object.keys(actions).filter((name) => /delete|remove/i.test(name))).toEqual([]);
});

test("[FR-058] archive and restore are logged with the user, stock unchanged", async () => {
  const owner = await signInAs("OWNER");
  const product = await makeProduct(categoryId, {
    name: "Oud Oil",
    code: "PF-OUD",
    stockQuantity: 3,
  });

  unwrap(await archiveProduct({ id: product.id }));
  unwrap(await restoreProduct({ id: product.id }));

  const history = unwrap(await listInventoryChanges({ product: product.id }));
  expect(
    history.items.map((e) => [e.type, e.quantityChange, e.stockAfter, e.userName, e.productId]),
  ).toEqual([
    ["RESTORE", 0, 3, owner.name, product.id],
    ["ARCHIVE", 0, 3, owner.name, product.id],
  ]);
  expect(unwrap(await listInventoryChanges({ type: "ARCHIVE" })).total).toBe(1);
  expect(unwrap(await listInventoryChanges({ type: "RESTORE" })).total).toBe(1);
});

test("[FR-058] archiving twice or restoring a product in use is refused, and nothing is logged", async () => {
  await signInAs("OWNER");
  const product = await makeProduct(categoryId, { name: "Amber" });

  expect(await restoreProduct({ id: product.id })).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: "Amber is not archived." },
  });
  unwrap(await archiveProduct({ id: product.id }));
  expect(await archiveProduct({ id: product.id })).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: "Amber is already archived." },
  });
  expect(await archiveProduct({ id: "missing" })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  expect(await db.inventoryChange.count({ where: { productId: product.id } })).toBe(1);
});

test("[ARCHIVE-STAFF-DENIED] staff can't archive, restore, or list archived products", async () => {
  const product = await makeProduct(categoryId, { name: "Vetiver" });
  const archived = await makeProduct(categoryId, { name: "Iris" });
  await db.product.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

  await signInAs("STAFF");
  for (const result of [
    await archiveProduct({ id: product.id }),
    await restoreProduct({ id: archived.id }),
  ]) {
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  }
  const rows = await db.product.findMany({ orderBy: { name: "asc" } });
  expect(rows.map((p) => [p.name, p.archivedAt !== null])).toEqual([
    ["Iris", true],
    ["Vetiver", false],
  ]);
  expect(await db.inventoryChange.count()).toBe(0);

  // The owner-only Archived filter is ignored for staff.
  const list = unwrap(await listProducts({ archived: "1" }));
  expect(list.items.map((p) => p.name)).toEqual(["Vetiver"]);
  expect(list.filters.archived).toBeUndefined();

  session.current = null;
  expect(await archiveProduct({ id: product.id })).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
});

// ---- FR-059: archived products can't be sold, restocked, or edited; codes reserved ---

test("[FR-059] an archived product can't be sold, restocked, or edited until restored", async () => {
  await signInAs("OWNER");
  const product = await makeProduct(categoryId, {
    name: "Musk",
    code: "PF-MUSK",
    stockQuantity: 4,
  });
  unwrap(await archiveProduct({ id: product.id }));

  const sale = await sell(product);
  expect(sale).toMatchObject({
    ok: false,
    error: {
      code: "NOT_FOUND",
      fieldErrors: { [`item:${product.id}`]: ["Musk was discontinued. Remove it."] },
    },
  });
  expect(await restock(product.id)).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: "This product is archived. Restore it first." },
  });
  const edit = await updateProduct(
    form({
      id: product.id,
      name: "Musk Deluxe",
      code: "PF-MUSK",
      categoryId,
      sellingPrice: "250",
      stockQuantity: "4",
      stockWhenLoaded: "4",
    }),
  );
  expect(edit).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

  const unchanged = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(unchanged).toMatchObject({ name: "Musk", stockQuantity: 4 });
  expect(await db.sale.count()).toBe(0);

  unwrap(await restoreProduct({ id: product.id }));
  unwrap(await sell(product));
  unwrap(await restock(product.id, 2));
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(5);
});

test("[FR-059] an archived product's code and barcode stay reserved", async () => {
  await signInAs("OWNER");
  const product = await makeProduct(categoryId, {
    name: "Neroli",
    code: "PF-NER",
    barcode: "4800000000028",
  });
  unwrap(await archiveProduct({ id: product.id }));

  const fields = { name: "New Neroli", categoryId, sellingPrice: "300", stockQuantity: "1" };
  expect(await createProduct(form({ ...fields, code: "pf-ner" }))).toMatchObject({
    ok: false,
    error: {
      code: "CONFLICT",
      message: "Code PF-NER is already used by Neroli (archived).",
    },
  });
  expect(
    await createProduct(form({ ...fields, code: "PF-NER2", barcode: "4800000000028" })),
  ).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: "That barcode is already used by Neroli (archived)." },
  });
  expect(await db.product.count()).toBe(1);
});

test("[FR-059] a category with only archived products can't be deleted; deleting a supplier unlinks them", async () => {
  await signInAs("OWNER");
  const supplier = await db.supplier.create({ data: { name: "Scents Co." } });
  const product = await makeProduct(categoryId);
  await db.product.update({ where: { id: product.id }, data: { supplierId: supplier.id } });
  unwrap(await archiveProduct({ id: product.id }));

  expect(await deleteCategory({ id: categoryId })).toMatchObject({ ok: false });
  expect(await db.category.count({ where: { id: categoryId } })).toBe(1);

  unwrap(await deleteSupplier({ id: supplier.id }));
  const kept = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(kept.supplierId).toBeNull();
  expect(kept.archivedAt).not.toBeNull();
});

// ---- FR-057: hidden from selling and stock figures, kept in history and reports -----

test("[FR-057] archived products are left out of the list, search, lookup, and offline catalog", async () => {
  await signInAs("OWNER");
  const kept = await makeProduct(categoryId, { name: "Jasmine Mist", code: "PF-JAS1" });
  const gone = await makeProduct(categoryId, {
    name: "Jasmine Oil",
    code: "PF-JAS2",
    barcode: "4800000000035",
  });
  unwrap(await archiveProduct({ id: gone.id }));

  expect(unwrap(await listProducts()).items.map((p) => p.id)).toEqual([kept.id]);
  expect(unwrap(await listProducts({ q: "jasmine" })).total).toBe(1);
  expect(unwrap(await searchProducts("jasmine")).map((h) => h.id)).toEqual([kept.id]);
  expect(unwrap(await lookupProduct("4800000000035"))).toBeNull();
  expect(unwrap(await lookupProduct("PF-JAS2"))).toBeNull();
  expect(unwrap(await lookupProduct("PF-JAS1"))?.id).toBe(kept.id);
  expect(unwrap(await catalogSnapshot()).map((p) => p.id)).toEqual([kept.id]);

  // The owner's Archived filter shows only archived products, flagged as such.
  const archived = unwrap(await listProducts({ archived: "1" }));
  expect(archived.items.map((p) => [p.id, p.archived])).toEqual([[gone.id, true]]);
  expect(archived.filters.archived).toBe("1");

  unwrap(await restoreProduct({ id: gone.id }));
  expect(unwrap(await searchProducts("jasmine"))).toHaveLength(2);
  expect(unwrap(await lookupProduct("4800000000035"))?.id).toBe(gone.id);
});

test("[FR-057] archived products are left out of low-stock alerts and dashboard stock figures", async () => {
  await signInAs("OWNER");
  const low = await makeProduct(categoryId, { name: "Low One", stockQuantity: 2 });
  const out = await makeProduct(categoryId, { name: "Out One", stockQuantity: 0 });
  const noCost = await makeProduct(categoryId, {
    name: "No Cost",
    stockQuantity: 40,
    purchasePrice: null,
  });
  await makeProduct(categoryId, { name: "Healthy", stockQuantity: 20 });

  const before = unwrap(await getDashboard());
  if (before.kind !== "owner") throw new Error("expected the owner dashboard");
  expect(before).toMatchObject({
    totalProducts: 4,
    unitsInStock: 62,
    outOfStockCount: 1,
    needsCost: { count: 1 },
    lowStock: { count: 2 },
  });

  for (const product of [low, out, noCost]) unwrap(await archiveProduct({ id: product.id }));

  const after = unwrap(await getDashboard());
  if (after.kind !== "owner") throw new Error("expected the owner dashboard");
  expect(after).toMatchObject({
    totalProducts: 1,
    unitsInStock: 20,
    outOfStockCount: 0,
    needsCost: { count: 0, items: [] },
    lowStock: { count: 0, items: [] },
  });
  expect(unwrap(await listProducts({ stock: "low" })).total).toBe(0);

  await signInAs("STAFF");
  const staff = unwrap(await getDashboard());
  expect(staff.lowStock).toEqual({ count: 0, items: [] });
});

test("[FR-057] archived products stay in sales history, inventory history, and reports", async () => {
  await signInAs("OWNER");
  const product = await makeProduct(categoryId, {
    name: "Sandal Oil",
    code: "PF-SAN",
    sellingPrice: 30_000,
    stockQuantity: 5,
  });
  const sale = unwrap(await sell(product, 2));
  unwrap(await archiveProduct({ id: product.id }));

  const report = unwrap(await getSalesReport({ period: "day" }));
  expect(report.totals).toMatchObject({ netSales: 60_000 });
  expect(report.bestSellers).toEqual([
    expect.objectContaining({ productId: product.id, name: "Sandal Oil", units: 2 }),
  ]);
  const items = await db.saleItem.findMany({ where: { saleId: sale.id } });
  expect(items).toMatchObject([{ productId: product.id, productName: "Sandal Oil" }]);
  const history = unwrap(await listInventoryChanges({ q: "sandal" }));
  expect(history.items.map((e) => e.type)).toEqual(["ARCHIVE", "SALE"]);
});
