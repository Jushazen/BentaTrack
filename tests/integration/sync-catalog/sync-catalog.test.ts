// Product, category, and supplier changes made on a device reach the server through /api/sync
// (FR-034, FR-036, FR-049, FR-053, FR-032, FR-054; leaf 9.4). The same actions and rules as online
// apply, each change is applied at most once however often it is sent, and a refusal leaves
// nothing behind, so the change can be retried.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/sync/route";
import { db } from "@/lib/db";
import type { Result } from "@/lib/result";
import { localUploadDir } from "@/lib/storage";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** A 1×1 PNG, as the product form sends a photo. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let user: { id: string };

async function signInAs(role: "OWNER" | "STAFF") {
  user = await makeUser(role);
  session.current = { user: { id: user.id } };
  return user;
}

async function sync(kind: string, input: Record<string, unknown>) {
  const response = await POST(
    new Request("http://localhost/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, recordedBy: user.id, input }),
    }),
  );
  return (await response.json()) as Result<Record<string, unknown>>;
}

function data(result: Result<Record<string, unknown>>): Record<string, unknown> {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function productFields(categoryId: string, overrides: Record<string, string> = {}) {
  return {
    name: "Abaca Tote",
    code: "TOTE-1",
    barcode: "",
    categoryId,
    brand: "Estetika",
    expirationDate: "",
    sellingPrice: "1,250.00",
    stockQuantity: "6",
    lowStockThreshold: "",
    ...overrides,
  };
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

test("[FR-034-CATALOG] a category, a product in it with a photo, an edit with a stock correction, archive, and restore all apply from a device, with the device's time", async () => {
  await signInAs("OWNER");
  const categoryId = randomUUID();
  expect(data(await sync("CATEGORY_CREATE", { id: categoryId, name: "  Woven Bags " }))).toEqual({
    id: categoryId,
    name: "Woven Bags",
  });

  const productId = randomUUID();
  const addedAt = minutesAgo(50);
  const created = await sync("PRODUCT_CREATE", {
    id: productId,
    occurredAt: addedAt,
    fields: productFields(categoryId, { purchasePrice: "700", supplierId: "" }),
    image: { name: "tote.png", dataUrl: PNG },
  });
  expect(data(created)).toMatchObject({ id: productId, name: "Abaca Tote" });
  const stored = await db.product.findUniqueOrThrow({ where: { id: productId } });
  expect(stored).toMatchObject({
    categoryId,
    sellingPrice: 125_000,
    purchasePrice: 70_000,
    stockQuantity: 6,
  });
  expect(stored.imageUrl).toMatch(/^\/products\/images\/.+\.png$/);
  expect(existsSync(path.join(localUploadDir(), path.basename(stored.imageUrl ?? "")))).toBe(true);

  const editedAt = minutesAgo(40);
  const edited = await sync("PRODUCT_UPDATE", {
    id: productId,
    commandId: randomUUID(),
    occurredAt: editedAt,
    fields: productFields(categoryId, {
      name: "Abaca Tote Large",
      stockQuantity: "4",
      stockWhenLoaded: "6",
    }),
    image: null,
  });
  expect(data(edited)).toMatchObject({ id: productId, name: "Abaca Tote Large" });

  const archivedAt = minutesAgo(30);
  data(
    await sync("PRODUCT_ARCHIVE", {
      id: productId,
      commandId: randomUUID(),
      occurredAt: archivedAt,
    }),
  );
  expect(
    (await db.product.findUniqueOrThrow({ where: { id: productId } })).archivedAt,
  ).not.toBeNull();
  const restoredAt = minutesAgo(20);
  data(
    await sync("PRODUCT_RESTORE", {
      id: productId,
      commandId: randomUUID(),
      occurredAt: restoredAt,
    }),
  );

  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  expect(product).toMatchObject({ name: "Abaca Tote Large", stockQuantity: 4, archivedAt: null });
  const history = await db.inventoryChange.findMany({
    where: { productId },
    orderBy: { occurredAt: "asc" },
  });
  expect(
    history.map((row) => [row.type, row.quantityChange, row.occurredAt.toISOString()]),
  ).toEqual([
    ["EDIT", 6, addedAt],
    ["EDIT", -2, editedAt],
    ["ARCHIVE", 0, archivedAt],
    ["RESTORE", 0, restoredAt],
  ]);
  expect(history.every((row) => row.userId === user.id)).toBe(true);
});

test("[FR-034-CATALOG] categories are renamed and deleted, and suppliers added, edited, and deleted from a device", async () => {
  await signInAs("OWNER");
  const category = await makeCategory("Fans");
  data(
    await sync("CATEGORY_RENAME", { id: category.id, commandId: randomUUID(), name: "Hand Fans" }),
  );
  expect((await db.category.findUniqueOrThrow({ where: { id: category.id } })).name).toBe(
    "Hand Fans",
  );

  const supplierId = randomUUID();
  data(
    await sync("SUPPLIER_CREATE", {
      id: supplierId,
      name: "Basey Weavers",
      contactPerson: "Lorna",
      phone: "0917 000 0000",
      email: "LORNA@Example.com",
      address: "",
    }),
  );
  data(
    await sync("SUPPLIER_UPDATE", {
      id: supplierId,
      commandId: randomUUID(),
      name: "Basey Weavers Co-op",
      contactPerson: "Lorna",
      phone: "",
      email: "lorna@example.com",
      address: "Basey, Samar",
    }),
  );
  expect(await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).toMatchObject({
    name: "Basey Weavers Co-op",
    phone: null,
    email: "lorna@example.com",
    address: "Basey, Samar",
  });
  const linked = await makeProduct(category.id);
  await db.product.update({ where: { id: linked.id }, data: { supplierId } });

  expect(data(await sync("SUPPLIER_DELETE", { id: supplierId, commandId: randomUUID() }))).toEqual({
    id: supplierId,
    productsUnlinked: 1,
  });
  expect((await db.product.findUniqueOrThrow({ where: { id: linked.id } })).supplierId).toBeNull();

  const empty = await makeCategory("Empty");
  expect(data(await sync("CATEGORY_DELETE", { id: empty.id, commandId: randomUUID() }))).toEqual({
    id: empty.id,
  });
  expect(await db.category.findUnique({ where: { id: empty.id } })).toBeNull();
});

test("[FR-036-CATALOG] a change sent again (its reply was lost) returns the first answer and is applied once", async () => {
  await signInAs("OWNER");
  const category = await makeCategory("Bags");
  const create = {
    id: randomUUID(),
    occurredAt: minutesAgo(5),
    fields: productFields(category.id),
    image: { name: "tote.png", dataUrl: PNG },
  };
  const first = data(await sync("PRODUCT_CREATE", create));
  expect(data(await sync("PRODUCT_CREATE", create))).toEqual(first);

  const edit = {
    id: create.id,
    commandId: randomUUID(),
    occurredAt: minutesAgo(4),
    fields: productFields(category.id, { stockQuantity: "3", stockWhenLoaded: "6" }),
    image: { name: "new.png", dataUrl: PNG },
  };
  const edited = data(await sync("PRODUCT_UPDATE", edit));
  const photoAfterEdit = (await db.product.findUniqueOrThrow({ where: { id: create.id } }))
    .imageUrl;
  expect(data(await sync("PRODUCT_UPDATE", edit))).toEqual(edited);

  const archive = { id: create.id, commandId: randomUUID(), occurredAt: minutesAgo(3) };
  const archived = await sync("PRODUCT_ARCHIVE", archive);
  // Not "already archived": the replay is recognised, not re-checked.
  expect(await sync("PRODUCT_ARCHIVE", archive)).toEqual(archived);

  const categoryAdd = { id: randomUUID(), name: "Fans" };
  expect(await sync("CATEGORY_CREATE", categoryAdd)).toEqual(
    await sync("CATEGORY_CREATE", categoryAdd),
  );
  const categoryDelete = { id: categoryAdd.id, commandId: randomUUID() };
  const deleted = await sync("CATEGORY_DELETE", categoryDelete);
  expect(deleted.ok).toBe(true);
  // Not "no longer exists".
  expect(await sync("CATEGORY_DELETE", categoryDelete)).toEqual(deleted);

  const supplierAdd = { id: randomUUID(), name: "Basey Weavers" };
  expect(await sync("SUPPLIER_CREATE", supplierAdd)).toEqual(
    await sync("SUPPLIER_CREATE", supplierAdd),
  );
  const supplierDelete = { id: supplierAdd.id, commandId: randomUUID() };
  const removed = await sync("SUPPLIER_DELETE", supplierDelete);
  expect(await sync("SUPPLIER_DELETE", supplierDelete)).toEqual(removed);

  expect(await db.product.count()).toBe(1);
  const product = await db.product.findUniqueOrThrow({ where: { id: create.id } });
  expect(product.stockQuantity).toBe(3);
  const history = await db.inventoryChange.findMany({ where: { productId: create.id } });
  expect(history.map((row) => row.type).sort()).toEqual(["ARCHIVE", "EDIT", "EDIT"]);
  // The replayed edit didn't swap in its own upload: the first send's photo is kept, on disk.
  expect(product.imageUrl).toBe(photoAfterEdit);
  expect(existsSync(path.join(localUploadDir(), path.basename(product.imageUrl ?? "")))).toBe(true);
  expect(await db.commandReceipt.count()).toBe(7);
});

test("[FR-049-ORDER] a category made offline, a product in it, and an edit to that product sync in the order they were made", async () => {
  await signInAs("OWNER");
  const categoryId = randomUUID();
  data(await sync("CATEGORY_CREATE", { id: categoryId, name: "Woven Bags" }));

  const productId = randomUUID();
  data(
    await sync("PRODUCT_CREATE", {
      id: productId,
      occurredAt: minutesAgo(10),
      fields: productFields(categoryId),
      image: null,
    }),
  );
  data(
    await sync("PRODUCT_UPDATE", {
      id: productId,
      commandId: randomUUID(),
      occurredAt: minutesAgo(9),
      fields: productFields(categoryId, { sellingPrice: "1,300", stockWhenLoaded: "6" }),
      image: null,
    }),
  );
  expect(await db.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
    categoryId,
    sellingPrice: 130_000,
  });

  // Out of order, the product would name a category the server doesn't have yet.
  const early = await sync("PRODUCT_CREATE", {
    id: randomUUID(),
    occurredAt: minutesAgo(8),
    fields: productFields(randomUUID(), { code: "TOTE-2" }),
    image: null,
  });
  expect(early).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
});

test("[FR-053-CATALOG] a duplicate code, a category in use, an edit of an archived product, and a stock count changed meanwhile are refused with the reason, leaving nothing applied", async () => {
  await signInAs("OWNER");
  const category = await makeCategory("Bags");
  const existing = await makeProduct(category.id, {
    name: "Banig Bag",
    code: "BAG-1",
    stockQuantity: 10,
  });

  const duplicate = {
    id: randomUUID(),
    occurredAt: minutesAgo(5),
    fields: productFields(category.id, { code: "bag-1" }),
    image: null,
  };
  expect(await sync("PRODUCT_CREATE", duplicate)).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: "Code BAG-1 is already used by Banig Bag." },
  });

  expect(await sync("CATEGORY_DELETE", { id: category.id, commandId: randomUUID() })).toMatchObject(
    {
      ok: false,
      error: { code: "CONFLICT", message: expect.stringContaining("still has 1 product") },
    },
  );

  // A sale elsewhere changed the stock after this device opened the form.
  await db.product.update({ where: { id: existing.id }, data: { stockQuantity: 8 } });
  const staleEdit = {
    id: existing.id,
    commandId: randomUUID(),
    occurredAt: minutesAgo(4),
    fields: productFields(category.id, {
      name: "Banig Bag",
      code: "BAG-1",
      stockQuantity: "12",
      stockWhenLoaded: "10",
    }),
    image: null,
  };
  expect(await sync("PRODUCT_UPDATE", staleEdit)).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: expect.stringContaining("Stock changed to 8") },
  });

  await db.product.update({ where: { id: existing.id }, data: { archivedAt: new Date() } });
  expect(
    await sync("PRODUCT_UPDATE", {
      ...staleEdit,
      commandId: randomUUID(),
      fields: { ...staleEdit.fields, stockWhenLoaded: "8" },
    }),
  ).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: "This product is archived. Restore it first." },
  });

  expect(await db.product.count()).toBe(1);
  expect(await db.inventoryChange.count()).toBe(0);
  expect(await db.commandReceipt.count()).toBe(0);

  // Refusals keep no receipt, so the same change can be tried again once the clash is gone.
  await db.product.update({ where: { id: existing.id }, data: { code: "BAG-OLD" } });
  expect(data(await sync("PRODUCT_CREATE", duplicate))).toMatchObject({ id: duplicate.id });
});

test("[FR-032-OFFLINE] staff changes from a device follow the staff limits: no categories, suppliers, archiving, purchase prices, or supplier links", async () => {
  await signInAs("STAFF");
  const category = await makeCategory("Bags");
  const product = await makeProduct(category.id);
  const refusals = [
    await sync("CATEGORY_CREATE", { id: randomUUID(), name: "Fans" }),
    await sync("CATEGORY_RENAME", { id: category.id, commandId: randomUUID(), name: "Totes" }),
    await sync("CATEGORY_DELETE", { id: category.id, commandId: randomUUID() }),
    await sync("SUPPLIER_CREATE", { id: randomUUID(), name: "Basey Weavers" }),
    await sync("PRODUCT_ARCHIVE", {
      id: product.id,
      commandId: randomUUID(),
      occurredAt: minutesAgo(1),
    }),
    await sync("PRODUCT_CREATE", {
      id: randomUUID(),
      occurredAt: minutesAgo(1),
      fields: productFields(category.id, { purchasePrice: "500" }),
      image: null,
    }),
    await sync("PRODUCT_CREATE", {
      id: randomUUID(),
      occurredAt: minutesAgo(1),
      fields: productFields(category.id, { code: "TOTE-9", supplierId: "" }),
      image: null,
    }),
  ];
  for (const result of refusals)
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  expect(await db.category.count()).toBe(1);
  expect(await db.product.count()).toBe(1);
  expect(await db.commandReceipt.count()).toBe(0);

  // What staff may do still works.
  const added = await sync("PRODUCT_CREATE", {
    id: randomUUID(),
    occurredAt: minutesAgo(1),
    fields: productFields(category.id),
    image: null,
  });
  expect(added).toMatchObject({ ok: true, data: { name: "Abaca Tote" } });
  expect(
    (await db.product.findFirstOrThrow({ where: { code: "TOTE-1" } })).purchasePrice,
  ).toBeNull();
});

test("[FR-054] a product change dated more than 5 minutes in the future is refused", async () => {
  await signInAs("OWNER");
  const category = await makeCategory("Bags");
  const result = await sync("PRODUCT_CREATE", {
    id: randomUUID(),
    occurredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    fields: productFields(category.id),
    image: null,
  });
  expect(result).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", fieldErrors: { occurredAt: [expect.stringContaining("future")] } },
  });
  expect(await db.product.count()).toBe(0);
});
