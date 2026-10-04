// Product, category, and supplier changes on the device (FR-034, FR-036, FR-049, FR-053, FR-032;
// leaf 9.4): queued in the outbox with their own ids, applied to the device store at once, kept
// across reloads and fresh downloads, sent in the order made, and kept with the reason when refused.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ProductCommand } from "@/features/products/schemas";
import type { RecordSaleInput } from "@/features/sales/schemas";
import {
  applySnapshot,
  catalogSyncedAt,
  lookupCatalog,
  META,
  searchCatalog,
  toCatalogProduct,
} from "@/lib/offline/catalog";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";
import { outboxEntries, readEntry } from "@/lib/offline/outbox";
import { listCategoriesFrom } from "@/lib/offline/read/catalog";
import { readDeviceRecords } from "@/lib/offline/read/device";
import { getProductFrom } from "@/lib/offline/read/products";
import {
  SNAPSHOT_VERSION,
  type Snapshot,
  type SnapshotCategory,
  type SnapshotProduct,
} from "@/lib/offline/snapshot";
import { flushOutbox, runCommand, setSyncUser } from "@/lib/offline/sync";
import { fail, ok, type Result } from "@/lib/result";

const OWNER = { id: "user-owner", name: "Odette", role: "OWNER" as const };
const STAFF = { id: "user-staff", name: "Sam", role: "STAFF" as const };
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const T = "2026-10-01T00:00:00.000Z";

let db: OfflineDb;
let dbName: string;
let dbCount = 0;
/** Bodies the fake server received, in order. */
let sent: { kind: string; input: { id: string; commandId?: string } }[];

function category(id: string, name: string): SnapshotCategory {
  return { id, name, createdAt: T, updatedAt: T };
}

function product(id: string, overrides: Partial<SnapshotProduct> = {}): SnapshotProduct {
  return {
    id,
    name: `Product ${id}`,
    code: id.toUpperCase(),
    barcode: null,
    brand: null,
    categoryId: "c-bags",
    categoryName: "Bags",
    supplierId: null,
    purchasePrice: 20_000,
    sellingPrice: 50_000,
    stockQuantity: 10,
    lowStockThreshold: 5,
    expirationDate: null,
    imageUrl: null,
    archivedAt: null,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  };
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    full: false,
    cursor: new Date().toISOString(),
    user: { id: OWNER.id, role: "OWNER" },
    products: [],
    categories: [],
    categoryIds: ["c-bags"],
    suppliers: [],
    supplierIds: [],
    users: [],
    userIds: [],
    sales: [],
    refunds: [],
    inventoryChanges: [],
    ...overrides,
  };
}

function fields(categoryId: string, overrides: Record<string, string> = {}) {
  return {
    name: "Abaca Tote",
    code: "TOTE-1",
    barcode: "",
    categoryId,
    brand: "",
    expirationDate: "",
    sellingPrice: "1,250",
    stockQuantity: "6",
    lowStockThreshold: "",
    ...overrides,
  };
}

function addProduct(categoryId: string, overrides: Partial<ProductCommand> = {}): ProductCommand {
  return {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    fields: fields(categoryId),
    image: null,
    ...overrides,
  };
}

function editProduct(id: string, categoryId: string, extra: Record<string, string>) {
  return {
    id,
    commandId: randomUUID(),
    occurredAt: new Date().toISOString(),
    fields: fields(categoryId, extra),
    image: null,
  };
}

function sale(productId: string, quantity: number): RecordSaleInput {
  return {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    items: [{ productId, quantity, unitPrice: 50_000 }],
    discount: null,
    paymentMethod: "CASH",
    customerInfo: "",
  };
}

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

/** Fakes /api/sync: `answer` decides each reply; the default accepts everything. */
function fakeServer(
  answer: (body: (typeof sent)[number]) => Result<unknown> = (body) =>
    ok({ id: body.input.id, name: "Saved", lowStockAlerts: [] }),
) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as (typeof sent)[number];
    sent.push(body);
    const reply = answer(body);
    return Response.json(reply, { status: reply.ok ? 200 : 409 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function stored(id: string) {
  return db.products.get(id);
}

beforeEach(async () => {
  dbName = `bentatrack-sync-catalog-${++dbCount}`;
  db = openOfflineDb(dbName);
  sent = [];
  setSyncUser(OWNER);
  await db.categories.bulkPut([category("c-bags", "Bags"), category("c-fans", "Fans")]);
  await db.products.bulkPut([
    toCatalogProduct(product("bag", { name: "Banig Bag", code: "BAG-1" })),
    toCatalogProduct(product("fan", { categoryId: "c-fans", categoryName: "Fans" })),
  ]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setSyncUser(null);
  await db.delete();
});

test("[FR-034-CATALOG] offline, products, categories, and suppliers change on the device at once and wait in the outbox", async () => {
  setOnline(false);
  const fetchMock = fakeServer();

  const categoryId = randomUUID();
  expect(await runCommand("CATEGORY_CREATE", { id: categoryId, name: " Woven " }, db)).toEqual(
    ok({ queued: true }),
  );
  const tote = addProduct(categoryId, {
    fields: fields(categoryId, { purchasePrice: "700" }),
    image: { name: "tote.png", dataUrl: PNG },
  });
  expect(await runCommand("PRODUCT_CREATE", tote, db)).toEqual(ok({ queued: true }));
  // Sellable offline straight away, with its photo from the device.
  const [hit] = await searchCatalog("tote", db);
  expect(hit).toMatchObject({
    id: tote.id,
    categoryName: "Woven",
    sellingPrice: 125_000,
    stockQuantity: 6,
    imageUrl: PNG,
  });
  expect((await stored(tote.id))?.purchasePrice).toBe(70_000);

  await runCommand(
    "PRODUCT_UPDATE",
    editProduct("bag", "c-bags", {
      name: "Banig Bag",
      code: "BAG-1",
      sellingPrice: "550",
      stockQuantity: "7",
      stockWhenLoaded: "10",
      removeImage: "true",
    }),
    db,
  );
  expect(await stored("bag")).toMatchObject({ sellingPrice: 55_000, stockQuantity: 7 });

  await runCommand(
    "PRODUCT_ARCHIVE",
    { id: "fan", commandId: randomUUID(), occurredAt: new Date().toISOString() },
    db,
  );
  expect(await lookupCatalog("FAN", db)).toBeNull();
  expect((await stored("fan"))?.archivedAt).not.toBeNull();

  await runCommand(
    "CATEGORY_RENAME",
    { id: "c-bags", commandId: randomUUID(), name: "Bags & Totes" },
    db,
  );
  expect((await stored("bag"))?.categoryName).toBe("Bags & Totes");

  const supplierId = randomUUID();
  await runCommand(
    "SUPPLIER_CREATE",
    { id: supplierId, name: "Basey Weavers", email: "A@B.PH" },
    db,
  );
  await runCommand(
    "PRODUCT_UPDATE",
    editProduct(tote.id, categoryId, { supplierId, stockWhenLoaded: "6" }),
    db,
  );
  expect((await stored(tote.id))?.supplierId).toBe(supplierId);
  await runCommand("SUPPLIER_DELETE", { id: supplierId, commandId: randomUUID() }, db);
  expect(await db.suppliers.get(supplierId)).toBeUndefined();
  expect((await stored(tote.id))?.supplierId).toBeNull();

  const records = await readDeviceRecords(db);
  const page = listCategoriesFrom(records, "OWNER");
  expect(page.ok && page.data.map((row) => [row.name, row.productCount])).toEqual([
    ["Bags & Totes", 1],
    ["Fans", 1],
    ["Woven", 1],
  ]);
  const detail = getProductFrom(records, "OWNER", tote.id);
  expect(detail.ok && detail.data).toMatchObject({ name: "Abaca Tote", categoryName: "Woven" });

  expect(fetchMock).not.toHaveBeenCalled();
  const summaries = (await outboxEntries(db)).map((entry) => readEntry(entry)?.payload.summary);
  expect(summaries).toEqual([
    "Add category “Woven”",
    "Add product Abaca Tote",
    "Edit product Banig Bag",
    `Archive Product fan`,
    "Rename category “Bags” to “Bags & Totes”",
    "Add supplier Basey Weavers",
    "Edit product Abaca Tote",
    "Delete supplier Basey Weavers",
  ]);
});

test("[FR-034-CATALOG] offline, what the device already knows the server would refuse is refused at once and not queued", async () => {
  setOnline(false);
  fakeServer();
  expect(
    await runCommand(
      "PRODUCT_CREATE",
      addProduct("c-bags", { fields: fields("c-bags", { code: "bag-1" }) }),
      db,
    ),
  ).toEqual(
    fail("CONFLICT", "Code BAG-1 is already used by Banig Bag.", {
      code: ["Already used by Banig Bag."],
    }),
  );
  expect(await runCommand("CATEGORY_CREATE", { id: randomUUID(), name: "fans" }, db)).toMatchObject(
    { ok: false, error: { code: "CONFLICT", fieldErrors: { name: [expect.any(String)] } } },
  );
  expect(
    await runCommand("CATEGORY_DELETE", { id: "c-bags", commandId: randomUUID() }, db),
  ).toMatchObject({
    ok: false,
    error: { message: expect.stringContaining("still has 1 product") },
  });
  expect(
    await runCommand(
      "PRODUCT_CREATE",
      addProduct("c-bags", { fields: fields("c-bags", { name: "" }) }),
      db,
    ),
  ).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", fieldErrors: { name: [expect.any(String)] } },
  });
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-036-CATALOG] queued changes survive closing the app, and a fresh download keeps showing them without counting stock twice", async () => {
  setOnline(false);
  fakeServer();
  const categoryId = randomUUID();
  await runCommand("CATEGORY_CREATE", { id: categoryId, name: "Woven" }, db);
  const tote = addProduct(categoryId);
  await runCommand("PRODUCT_CREATE", tote, db);
  await runCommand("SALE", sale("bag", 2), db);
  await runCommand(
    "PRODUCT_UPDATE",
    editProduct("bag", "c-bags", {
      name: "Banig Bag XL",
      code: "BAG-1",
      stockQuantity: "8",
      stockWhenLoaded: "8",
    }),
    db,
  );
  db.close();
  db = openOfflineDb(dbName);
  expect((await outboxEntries(db)).map((entry) => entry.kind)).toEqual([
    "CATEGORY_CREATE",
    "PRODUCT_CREATE",
    "SALE",
    "PRODUCT_UPDATE",
  ]);
  expect(await stored("bag")).toMatchObject({ name: "Banig Bag XL", stockQuantity: 8 });

  // The server's copy of the bag (none of these changes yet) comes down in a partial download.
  await applySnapshot(
    snapshot({
      products: [product("bag", { name: "Banig Bag", code: "BAG-1", stockQuantity: 10 })],
    }),
    new Date(),
    db,
  );
  expect(await stored("bag")).toMatchObject({ name: "Banig Bag XL", stockQuantity: 8 });
  expect(await stored(tote.id)).toMatchObject({ name: "Abaca Tote" });

  // A download that doesn't include the bag leaves it alone: the sale isn't taken off again.
  await applySnapshot(snapshot({ products: [product("fan")] }), new Date(), db);
  expect((await stored("bag"))?.stockQuantity).toBe(8);

  // A full download replaces everything; the queued changes are applied again on top.
  await applySnapshot(
    snapshot({
      full: true,
      products: [
        product("bag", { name: "Banig Bag", code: "BAG-1", stockQuantity: 10 }),
        product("fan"),
      ],
      categories: [category("c-bags", "Bags")],
    }),
    new Date(),
    db,
  );
  expect(await stored("bag")).toMatchObject({ name: "Banig Bag XL", stockQuantity: 8 });
  expect(await stored(tote.id)).toMatchObject({ categoryId, categoryName: "Woven" });
  expect((await db.categories.get(categoryId))?.name).toBe("Woven");
  expect(await catalogSyncedAt(db)).not.toBeNull();
  expect(await outboxEntries(db)).toHaveLength(4);
});

test("[FR-049-ORDER] a category added offline, a product in it, and an edit to that product are sent in the order made", async () => {
  setOnline(false);
  const categoryId = randomUUID();
  const tote = addProduct(categoryId, { image: { name: "tote.png", dataUrl: PNG } });
  const edit = editProduct(tote.id, categoryId, { sellingPrice: "1,300", stockWhenLoaded: "6" });
  await runCommand("CATEGORY_CREATE", { id: categoryId, name: "Woven" }, db);
  await runCommand("PRODUCT_CREATE", tote, db);
  await runCommand("PRODUCT_UPDATE", edit, db);

  setOnline(true);
  fakeServer();
  const report = await flushOutbox({ db });
  expect(report.synced.map((row) => row.kind)).toEqual([
    "CATEGORY_CREATE",
    "PRODUCT_CREATE",
    "PRODUCT_UPDATE",
  ]);
  expect(sent.map((body) => [body.kind, body.input.commandId ?? body.input.id])).toEqual([
    ["CATEGORY_CREATE", categoryId],
    ["PRODUCT_CREATE", tote.id],
    ["PRODUCT_UPDATE", edit.commandId],
  ]);
  // The photo travels with the change that waited for the connection.
  expect(sent[1].input).toMatchObject({ image: { dataUrl: PNG } });
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-049-ORDER] online, a change that needs one still waiting goes after it and gets the server's answer; unrelated changes don't wait", async () => {
  setOnline(false);
  const categoryId = randomUUID();
  await runCommand("CATEGORY_CREATE", { id: categoryId, name: "Woven" }, db);

  setOnline(true);
  fakeServer((body) =>
    body.kind === "SALE"
      ? ok({ id: body.input.id, total: 100_000, lowStockAlerts: [] })
      : ok({ id: body.input.id, name: "Abaca Tote", lowStockAlerts: [] }),
  );
  // A sale of a product the server knows doesn't wait for the category.
  const unrelated = sale("bag", 1);
  expect(await runCommand("SALE", unrelated, db)).toMatchObject({
    ok: true,
    data: { queued: false },
  });
  expect(sent.map((body) => body.kind)).toEqual(["SALE"]);

  const tote = addProduct(categoryId);
  const reply = await runCommand("PRODUCT_CREATE", tote, db);
  expect(reply).toMatchObject({ ok: true, data: { id: tote.id, queued: false } });
  expect(sent.map((body) => body.kind)).toEqual(["SALE", "CATEGORY_CREATE", "PRODUCT_CREATE"]);
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-053-CATALOG] a refused change stays on the device with its reason, leaves the device's copy at the next download, and can be retried or discarded", async () => {
  setOnline(false);
  const tote = addProduct("c-bags");
  await runCommand("PRODUCT_CREATE", tote, db);
  await runCommand(
    "CATEGORY_RENAME",
    { id: "c-fans", commandId: randomUUID(), name: "Abaniko" },
    db,
  );
  await db.meta.put({ key: META.cursor, value: T });

  setOnline(true);
  const reason = "Code TOTE-1 is already used by Tote (archived).";
  fakeServer((body) =>
    body.kind === "PRODUCT_CREATE"
      ? fail("CONFLICT", reason)
      : ok({ id: "c-fans", name: "Abaniko" }),
  );
  const report = await flushOutbox({ db });
  expect(report.refused).toEqual([{ summary: "Add product Abaca Tote", message: reason }]);
  expect(report.synced.map((row) => row.kind)).toEqual(["CATEGORY_RENAME"]);
  const [kept] = await outboxEntries(db);
  expect(kept).toMatchObject({ id: tote.id, kind: "PRODUCT_CREATE", lastError: reason });
  expect(readEntry(kept)?.payload.input).toEqual(tote);
  // The next download is a full one, which no longer shows the refused product.
  expect(await db.meta.get(META.cursor)).toBeUndefined();
  await applySnapshot(
    snapshot({
      full: true,
      products: [product("bag"), product("fan")],
      categories: [category("c-bags", "Bags")],
    }),
    new Date(),
    db,
  );
  expect(await stored(tote.id)).toBeUndefined();

  // A routine replay skips it; "Sync now" tries it again.
  expect((await flushOutbox({ db })).refused).toEqual([]);
  fakeServer(() => ok({ id: tote.id, name: "Abaca Tote", lowStockAlerts: [] }));
  const retried = await flushOutbox({ db, includeRefused: true });
  expect(retried.synced.map((row) => row.kind)).toEqual(["PRODUCT_CREATE"]);
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-032-OFFLINE] staff can't queue owner-only changes; their own product changes queue without costs or suppliers", async () => {
  setSyncUser(STAFF);
  setOnline(false);
  const fetchMock = fakeServer();
  const forbidden = [
    await runCommand("CATEGORY_CREATE", { id: randomUUID(), name: "Woven" }, db),
    await runCommand(
      "CATEGORY_RENAME",
      { id: "c-bags", commandId: randomUUID(), name: "Totes" },
      db,
    ),
    await runCommand("CATEGORY_DELETE", { id: "c-fans", commandId: randomUUID() }, db),
    await runCommand("SUPPLIER_CREATE", { id: randomUUID(), name: "Basey Weavers" }, db),
    await runCommand(
      "PRODUCT_ARCHIVE",
      { id: "bag", commandId: randomUUID(), occurredAt: new Date().toISOString() },
      db,
    ),
    await runCommand(
      "PRODUCT_RESTORE",
      { id: "bag", commandId: randomUUID(), occurredAt: new Date().toISOString() },
      db,
    ),
    await runCommand(
      "PRODUCT_CREATE",
      addProduct("c-bags", { fields: fields("c-bags", { purchasePrice: "500" }) }),
      db,
    ),
    await runCommand(
      "PRODUCT_CREATE",
      addProduct("c-bags", { fields: fields("c-bags", { supplierId: "" }) }),
      db,
    ),
  ];
  for (const reply of forbidden)
    expect(reply).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  expect(await outboxEntries(db)).toEqual([]);
  expect(await db.categories.count()).toBe(2);

  const tote = addProduct("c-bags");
  expect(await runCommand("PRODUCT_CREATE", tote, db)).toEqual(ok({ queued: true }));
  expect(await stored(tote.id)).toMatchObject({ purchasePrice: null, supplierId: null });
  expect(readEntry((await outboxEntries(db))[0])?.payload).toMatchObject({ userId: STAFF.id });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("[FR-032-OFFLINE] the owner's queued supplier changes and purchase prices never reach a staff member's copy of the data", async () => {
  setOnline(false);
  fakeServer();
  const supplierId = randomUUID();
  await runCommand("SUPPLIER_CREATE", { id: supplierId, name: "Basey Weavers" }, db);
  const tote = addProduct("c-bags", {
    fields: fields("c-bags", { purchasePrice: "700", supplierId }),
  });
  await runCommand("PRODUCT_CREATE", tote, db);

  // The owner signs out without syncing; staff sign in and their first download arrives.
  setSyncUser(STAFF);
  await applySnapshot(
    snapshot({
      full: true,
      user: { id: STAFF.id, role: "STAFF" },
      products: [product("bag", { purchasePrice: null }), product("fan", { purchasePrice: null })],
      categories: [category("c-bags", "Bags")],
    }),
    new Date(),
    db,
  );
  expect(await db.suppliers.count()).toBe(0);
  // The owner's new product still shows (staff may see products), without its cost or supplier.
  expect(await stored(tote.id)).toMatchObject({
    name: "Abaca Tote",
    purchasePrice: null,
    supplierId: null,
  });
  // Nothing recorded offline is lost: both still wait for the owner (FR-036).
  expect((await outboxEntries(db)).map((entry) => entry.kind)).toEqual([
    "SUPPLIER_CREATE",
    "PRODUCT_CREATE",
  ]);
});
