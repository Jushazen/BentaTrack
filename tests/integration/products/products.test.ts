import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GET as getLocalImage } from "@/app/(app)/products/images/[file]/route";
import { createSupplier } from "@/features/suppliers/actions";
import { createProduct, deleteProduct, updateProduct } from "@/features/products/actions";
import { getProduct, listProducts } from "@/features/products/queries";
import { db } from "@/lib/db";
import { localUploadDir } from "@/lib/storage";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request, and revalidatePath needs Next's request store.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const blob = vi.hoisted(() => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://blob.example.test/${pathname}` })),
  del: vi.fn(async () => undefined),
}));
vi.mock("@vercel/blob", () => blob);

async function signInAs(role: "OWNER" | "STAFF") {
  const user = await makeUser(role);
  session.current = { user: { id: user.id } };
  return user;
}

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

/** Builds the FormData a product form would post. */
function form(fields: Record<string, string | File | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) data.set(key, value);
  }
  return data;
}

// A real 1×1 PNG.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const png = (name = "tote.png") => new File([PNG_BYTES], name, { type: "image/png" });

const DENIED = { ok: false, error: { code: "FORBIDDEN" } };

let categoryId: string;
const storedFiles: string[] = [];

function localFile(url: string | null): string {
  expect(url).toMatch(/^\/products\/images\/[0-9a-f-]{36}\.png$/);
  const file = path.join(localUploadDir(), path.basename(url ?? ""));
  storedFiles.push(file);
  return file;
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  blob.put.mockClear();
  blob.del.mockClear();
  categoryId = (await makeCategory("Bags")).id;
});

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(storedFiles.splice(0).map((file) => rm(file, { force: true })));
});

const basics = (overrides: Record<string, string | File | undefined> = {}) =>
  form({
    name: "Leather Tote",
    code: "BAG-001",
    categoryId,
    sellingPrice: "899.50",
    stockQuantity: "12",
    ...overrides,
  });

// ---- Add (FR-001, FR-002) ---------------------------------------------------------

test("[FR-001] the owner adds a product with every field", async () => {
  const owner = await signInAs("OWNER");
  const supplier = unwrap(await createSupplier({ name: "Manila Leather Co." }));

  const saved = unwrap(
    await createProduct(
      basics({
        name: "  Leather Tote ",
        barcode: "4800016123457",
        brand: "Estetika",
        purchasePrice: "450",
        supplierId: supplier.id,
        lowStockThreshold: "3",
        expirationDate: "2027-06-30",
      }),
    ),
  );

  const product = await db.product.findUniqueOrThrow({ where: { id: saved.id } });
  expect(product).toMatchObject({
    name: "Leather Tote",
    code: "BAG-001",
    barcode: "4800016123457",
    categoryId,
    brand: "Estetika",
    supplierId: supplier.id,
    purchasePrice: 45_000,
    sellingPrice: 89_950,
    stockQuantity: 12,
    lowStockThreshold: 3,
    imageUrl: null,
  });
  expect(product.expirationDate?.toISOString().slice(0, 10)).toBe("2027-06-30");

  // The starting stock is the first line of the product's history.
  expect(await db.inventoryChange.findMany({ where: { productId: saved.id } })).toEqual([
    expect.objectContaining({
      type: "EDIT",
      quantityChange: 12,
      stockAfter: 12,
      userId: owner.id,
      note: "Product added",
      productName: "Leather Tote",
      productCode: "BAG-001",
    }),
  ]);
});

test("[FR-001] staff add a product without purchase price or supplier", async () => {
  await signInAs("STAFF");
  const saved = unwrap(await createProduct(basics()));
  expect(await db.product.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({
    purchasePrice: null,
    supplierId: null,
    lowStockThreshold: 5, // FR-037 default when left blank
  });
});

test("[FR-001] signed-out callers can't add products", async () => {
  expect(await createProduct(basics())).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
  expect(await db.product.count()).toBe(0);
});

test("[FR-002] product input is validated field by field", async () => {
  await signInAs("OWNER");
  const result = await createProduct(
    form({
      name: " ",
      code: "",
      barcode: "48 0001",
      categoryId: "",
      sellingPrice: "12.345",
      purchasePrice: "abc",
      stockQuantity: "-1",
      lowStockThreshold: "2.5",
      expirationDate: "2027-02-30x",
    }),
  );
  expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  const fields = result.ok ? {} : (result.error.fieldErrors ?? {});
  expect(Object.keys(fields).sort()).toEqual(
    [
      "barcode",
      "categoryId",
      "code",
      "expirationDate",
      "lowStockThreshold",
      "name",
      "purchasePrice",
      "sellingPrice",
      "stockQuantity",
    ].sort(),
  );
  expect(await createProduct(basics({ sellingPrice: "0" }))).toMatchObject({
    ok: false,
    error: { fieldErrors: { sellingPrice: [expect.stringMatching(/more than/)] } },
  });
  // A select left on its placeholder isn't posted at all.
  expect(await createProduct(basics({ categoryId: undefined }))).toMatchObject({
    ok: false,
    error: { fieldErrors: { categoryId: ["Choose a category."] } },
  });
  expect(await createProduct(basics({ categoryId: "missing" }))).toMatchObject({
    ok: false,
    error: { fieldErrors: { categoryId: [expect.any(String)] } },
  });
  expect(await db.product.count()).toBe(0);
});

test("[FR-002] code is unique (ignoring case); barcode is optional but unique", async () => {
  await signInAs("OWNER");
  unwrap(await createProduct(basics({ barcode: "4800016123457" })));

  expect(await createProduct(basics({ name: "Other", code: "bag-001" }))).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", fieldErrors: { code: [expect.stringMatching(/Leather Tote/)] } },
  });
  expect(await createProduct(basics({ code: "BAG-002", barcode: "4800016123457" }))).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", fieldErrors: { barcode: [expect.any(String)] } },
  });
  // Any number of products may have no barcode.
  unwrap(await createProduct(basics({ code: "BAG-003", barcode: "" })));
  unwrap(await createProduct(basics({ code: "BAG-004" })));
  expect(await db.product.count({ where: { barcode: null } })).toBe(2);
});

// ---- Edit (FR-003, EDIT-LOG) ------------------------------------------------------

test("[FR-003] the owner edits any product field", async () => {
  await signInAs("OWNER");
  const perfumes = await makeCategory("Perfumes");
  const supplier = unwrap(await createSupplier({ name: "Scent House" }));
  const { id } = unwrap(await createProduct(basics({ purchasePrice: "450" })));

  const saved = unwrap(
    await updateProduct(
      form({
        id,
        name: "Eau de Parfum",
        code: "PF-010",
        barcode: "123456789012",
        categoryId: perfumes.id,
        brand: "Maison",
        sellingPrice: "1,250",
        purchasePrice: "",
        supplierId: supplier.id,
        stockQuantity: "7",
        stockWhenLoaded: "12",
        lowStockThreshold: "2",
        expirationDate: "2028-01-15",
      }),
    ),
  );
  expect(saved).toMatchObject({ id, name: "Eau de Parfum" });
  expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({
    name: "Eau de Parfum",
    code: "PF-010",
    barcode: "123456789012",
    categoryId: perfumes.id,
    brand: "Maison",
    sellingPrice: 125_000,
    purchasePrice: null,
    supplierId: supplier.id,
    stockQuantity: 7,
    lowStockThreshold: 2,
  });
  expect(await updateProduct(basics({ id: "missing", stockWhenLoaded: "12" }))).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
});

test("[FR-003] staff edit details and the owner's cost and supplier stay as they were", async () => {
  await signInAs("OWNER");
  const supplier = unwrap(await createSupplier({ name: "Manila Leather" }));
  const { id } = unwrap(
    await createProduct(basics({ purchasePrice: "450", supplierId: supplier.id })),
  );

  await signInAs("STAFF");
  unwrap(
    await updateProduct(
      basics({ id, name: "Leather Tote (Brown)", sellingPrice: "950", stockWhenLoaded: "12" }),
    ),
  );
  expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({
    name: "Leather Tote (Brown)",
    sellingPrice: 95_000,
    purchasePrice: 45_000,
    supplierId: supplier.id,
  });
});

test("[EDIT-LOG] each saved edit is logged with who, when, what changed, and the stock change", async () => {
  await signInAs("OWNER");
  const { id } = unwrap(await createProduct(basics({ purchasePrice: "450" })));
  const staff = await signInAs("STAFF");
  const before = new Date();

  unwrap(
    await updateProduct(
      basics({ id, sellingPrice: "950", stockQuantity: "10", stockWhenLoaded: "12" }),
    ),
  );
  const edits = await db.inventoryChange.findMany({
    where: { productId: id, type: "EDIT", note: { not: "Product added" } },
  });
  expect(edits).toHaveLength(1);
  expect(edits[0]).toMatchObject({
    userId: staff.id,
    quantityChange: -2,
    stockAfter: 10,
    productName: "Leather Tote",
    note: "Selling price: ₱899.50 → ₱950.00; Stock: 12 → 10",
  });
  expect(edits[0].occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);

  // Saving with nothing changed logs nothing.
  unwrap(
    await updateProduct(
      basics({ id, sellingPrice: "950", stockQuantity: "10", stockWhenLoaded: "10" }),
    ),
  );
  expect(await db.inventoryChange.count({ where: { productId: id } })).toBe(2);

  // Cost changes are logged without the amount, because staff can read the history.
  await signInAs("OWNER");
  unwrap(
    await updateProduct(
      basics({
        id,
        sellingPrice: "950",
        stockQuantity: "10",
        stockWhenLoaded: "10",
        purchasePrice: "500",
      }),
    ),
  );
  const costEdit = await db.inventoryChange.findFirstOrThrow({
    where: { productId: id },
    orderBy: { recordedAt: "desc" },
  });
  expect(costEdit).toMatchObject({ quantityChange: 0, note: "Purchase price updated" });
  expect(costEdit.note).not.toContain("500");
});

test("[EDIT-LOG] a stock edit is refused if a sale changed the stock after the form opened", async () => {
  await signInAs("STAFF");
  const { id } = unwrap(await createProduct(basics()));
  await db.product.update({ where: { id }, data: { stockQuantity: 11 } }); // a sale elsewhere

  expect(
    await updateProduct(basics({ id, stockQuantity: "15", stockWhenLoaded: "12" })),
  ).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", fieldErrors: { stockQuantity: [expect.stringMatching(/11/)] } },
  });
  // Editing other details from the stale form leaves the newer stock alone.
  unwrap(
    await updateProduct(basics({ id, name: "Tote", stockQuantity: "12", stockWhenLoaded: "12" })),
  );
  expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({
    name: "Tote",
    stockQuantity: 11,
  });
});

test("[EDIT-LOG] lowering stock into Low Stock returns a low-stock alert", async () => {
  await signInAs("OWNER");
  const { id } = unwrap(await createProduct(basics()));
  const saved = unwrap(
    await updateProduct(basics({ id, stockQuantity: "4", stockWhenLoaded: "12" })),
  );
  expect(saved.lowStockAlerts).toEqual([
    { productId: id, name: "Leather Tote", quantity: 4, threshold: 5 },
  ]);
  const unchanged = unwrap(
    await updateProduct(basics({ id, stockQuantity: "3", stockWhenLoaded: "4" })),
  );
  expect(unchanged.lowStockAlerts).toEqual([]); // already Low Stock
});

// ---- Delete (FR-004) --------------------------------------------------------------

test("[FR-004] the owner deletes a discontinued product; its history keeps name and code", async () => {
  const owner = await signInAs("OWNER");
  const { id } = unwrap(await createProduct(basics({ name: "Old Perfume", code: "PF-OLD" })));

  expect(await deleteProduct({ id })).toEqual({ ok: true, data: { id, name: "Old Perfume" } });
  expect(await db.product.count({ where: { id } })).toBe(0);

  const history = await db.inventoryChange.findMany({
    where: { productCode: "PF-OLD" },
    orderBy: { recordedAt: "asc" },
  });
  expect(history.map((h) => [h.type, h.quantityChange, h.stockAfter, h.productId])).toEqual([
    ["EDIT", 12, 12, null],
    ["REMOVAL", -12, 0, null],
  ]);
  expect(history[1]).toMatchObject({ userId: owner.id, productName: "Old Perfume" });
  expect(await deleteProduct({ id })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
});

test("[FR-004-STAFF] staff can't delete products", async () => {
  const product = await makeProduct(categoryId);
  await signInAs("STAFF");
  expect(await deleteProduct({ id: product.id })).toMatchObject(DENIED);
  expect(await db.product.count({ where: { id: product.id } })).toBe(1);
});

test("[FR-004-STAFF] staff can't set or see purchase price or supplier", async () => {
  await signInAs("OWNER");
  const supplier = unwrap(await createSupplier({ name: "Secret Supplier" }));
  const { id } = unwrap(
    await createProduct(basics({ purchasePrice: "123.45", supplierId: supplier.id })),
  );

  await signInAs("STAFF");
  expect(await createProduct(basics({ code: "X-1", purchasePrice: "1" }))).toMatchObject(DENIED);
  expect(await createProduct(basics({ code: "X-2", supplierId: supplier.id }))).toMatchObject(
    DENIED,
  );
  expect(
    await updateProduct(basics({ id, stockWhenLoaded: "12", purchasePrice: "1" })),
  ).toMatchObject(DENIED);
  expect(await updateProduct(basics({ id, stockWhenLoaded: "12", supplierId: "" }))).toMatchObject(
    DENIED,
  );

  const detail = unwrap(await getProduct(id));
  expect(detail.costs).toBeNull();
  const everything = JSON.stringify([detail, unwrap(await listProducts())]);
  expect(everything).not.toMatch(/purchasePrice|Secret Supplier|12345/);
  expect(await db.product.findUniqueOrThrow({ where: { id } })).toMatchObject({
    purchasePrice: 12_345,
    supplierId: supplier.id,
  });
});

// ---- Supplier link (FR-042) -------------------------------------------------------

test("[FR-042] each product references a supplier record the owner can see and change", async () => {
  await signInAs("OWNER");
  const first = unwrap(await createSupplier({ name: "Manila Leather" }));
  const second = unwrap(await createSupplier({ name: "Cebu Crafts" }));
  const { id } = unwrap(await createProduct(basics({ supplierId: first.id })));
  expect(unwrap(await getProduct(id)).costs).toEqual({
    purchasePrice: null,
    supplierId: first.id,
    supplierName: "Manila Leather",
  });

  unwrap(await updateProduct(basics({ id, stockWhenLoaded: "12", supplierId: second.id })));
  expect(unwrap(await getProduct(id)).costs?.supplierName).toBe("Cebu Crafts");
  expect(
    await updateProduct(basics({ id, stockWhenLoaded: "12", supplierId: "missing" })),
  ).toMatchObject({ ok: false, error: { fieldErrors: { supplierId: [expect.any(String)] } } });
  unwrap(await updateProduct(basics({ id, stockWhenLoaded: "12", supplierId: "" })));
  expect(unwrap(await getProduct(id)).costs?.supplierId).toBeNull();
});

// ---- Needs cost (A7 follow-on) ----------------------------------------------------

test("[NEEDS-COST] staff-added products are flagged for the owner until a cost is set", async () => {
  await signInAs("OWNER");
  unwrap(await createProduct(basics({ code: "HAS-COST", purchasePrice: "400" })));
  await signInAs("STAFF");
  const { id } = unwrap(await createProduct(basics({ name: "New Arrival", code: "NEW-1" })));

  // Staff never see the flag, and their cost filter is ignored.
  const staffView = unwrap(await listProducts({ cost: "missing" }));
  expect(staffView.total).toBe(2);
  expect(staffView.items.every((p) => !p.needsCost)).toBe(true);

  await signInAs("OWNER");
  const needing = unwrap(await listProducts({ cost: "missing" }));
  expect(needing.items.map((p) => [p.code, p.needsCost])).toEqual([["NEW-1", true]]);
  expect(unwrap(await getProduct(id)).needsCost).toBe(true);

  unwrap(
    await updateProduct(
      basics({
        id,
        name: "New Arrival",
        code: "NEW-1",
        stockWhenLoaded: "12",
        purchasePrice: "300",
      }),
    ),
  );
  expect(unwrap(await listProducts({ cost: "missing" })).total).toBe(0);
  expect(unwrap(await getProduct(id)).needsCost).toBe(false);
});

// ---- List filters (FR-006, FR-009) ------------------------------------------------

test("[FR-009] the list filters Low Stock and Out of Stock separately and searches", async () => {
  await makeProduct(categoryId, { name: "Plenty", code: "A-1", stockQuantity: 20 });
  await makeProduct(categoryId, { name: "Few", code: "A-2", stockQuantity: 2 });
  await makeProduct(categoryId, { name: "None", code: "A-3", stockQuantity: 0, barcode: "999" });
  await signInAs("STAFF");

  const all = unwrap(await listProducts());
  expect(all.items.map((p) => [p.name, p.status])).toEqual([
    ["Few", "LOW_STOCK"],
    ["None", "OUT_OF_STOCK"],
    ["Plenty", "ACTIVE"],
  ]);
  expect(unwrap(await listProducts({ stock: "low" })).items.map((p) => p.name)).toEqual([
    "Few",
    "None",
  ]);
  expect(unwrap(await listProducts({ stock: "out" })).items.map((p) => p.name)).toEqual(["None"]);
  expect(unwrap(await listProducts({ q: "a-1" })).items.map((p) => p.name)).toEqual(["Plenty"]);
  expect(unwrap(await listProducts({ q: "999" })).items.map((p) => p.name)).toEqual(["None"]);
  // Unknown filter values are ignored rather than failing the page.
  expect(unwrap(await listProducts({ stock: "weird", page: "-3" })).total).toBe(3);
});

// ---- Images (D2) ------------------------------------------------------------------

test("[IMG-1] a product photo is stored on local disk and served to signed-in users", async () => {
  await signInAs("STAFF");
  const { id } = unwrap(await createProduct(basics({ image: png() })));
  const { imageUrl } = await db.product.findUniqueOrThrow({ where: { id } });
  const file = localFile(imageUrl);
  expect(existsSync(file)).toBe(true);

  const name = path.basename(file);
  const ctx = { params: Promise.resolve({ file: name }) };
  const response = await getLocalImage(new Request(`http://test${imageUrl}`), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await response.arrayBuffer()).equals(PNG_BYTES)).toBe(true);

  // Path tricks and signed-out visitors get nothing.
  const bad = { params: Promise.resolve({ file: "../../package.json" }) };
  expect((await getLocalImage(new Request("http://test/x"), bad)).status).toBe(404);
  session.current = null;
  expect((await getLocalImage(new Request(`http://test${imageUrl}`), ctx)).status).toBe(404);
});

test("[IMG-1] replacing, removing, or deleting a photo removes the old file", async () => {
  await signInAs("OWNER");
  const { id } = unwrap(await createProduct(basics({ image: png() })));
  const first = localFile((await db.product.findUniqueOrThrow({ where: { id } })).imageUrl);

  unwrap(await updateProduct(basics({ id, stockWhenLoaded: "12", image: png("new.png") })));
  const second = localFile((await db.product.findUniqueOrThrow({ where: { id } })).imageUrl);
  expect(existsSync(first)).toBe(false);
  expect(existsSync(second)).toBe(true);
  expect(
    (
      await db.inventoryChange.findFirstOrThrow({
        where: { productId: id },
        orderBy: { recordedAt: "desc" },
      })
    ).note,
  ).toBe("Photo changed");

  unwrap(await updateProduct(basics({ id, stockWhenLoaded: "12", removeImage: "true" })));
  expect((await db.product.findUniqueOrThrow({ where: { id } })).imageUrl).toBeNull();
  expect(existsSync(second)).toBe(false);

  unwrap(await updateProduct(basics({ id, stockWhenLoaded: "12", image: png() })));
  const third = localFile((await db.product.findUniqueOrThrow({ where: { id } })).imageUrl);
  unwrap(await deleteProduct({ id }));
  expect(existsSync(third)).toBe(false);
});

test("[IMG-1] files that aren't photos, or are too large, are refused", async () => {
  await signInAs("OWNER");
  const fake = new File([Buffer.from("<script>alert(1)</script>")], "x.png", {
    type: "image/png",
  });
  expect(await createProduct(basics({ image: fake }))).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", fieldErrors: { image: [expect.stringMatching(/isn't a JPEG/)] } },
  });
  const pdf = new File([PNG_BYTES], "x.pdf", { type: "application/pdf" });
  expect(await createProduct(basics({ image: pdf }))).toMatchObject({
    ok: false,
    error: { fieldErrors: { image: [expect.any(String)] } },
  });
  const huge = new File([PNG_BYTES, new Uint8Array(1024 * 1024)], "big.png", {
    type: "image/png",
  });
  expect(await createProduct(basics({ image: huge }))).toMatchObject({
    ok: false,
    error: { fieldErrors: { image: [expect.stringMatching(/too large/)] } },
  });
  expect(await db.product.count()).toBe(0);
});

test("[IMG-1] with a Blob token, photos go to Vercel Blob", async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  await signInAs("OWNER");
  const { id } = unwrap(await createProduct(basics({ image: png() })));
  const { imageUrl } = await db.product.findUniqueOrThrow({ where: { id } });

  expect(blob.put).toHaveBeenCalledWith(
    expect.stringMatching(/^products\/[0-9a-f-]{36}\.png$/),
    expect.any(Buffer),
    { access: "public", contentType: "image/png" },
  );
  expect(imageUrl).toMatch(/^https:\/\/blob\.example\.test\/products\//);

  unwrap(await deleteProduct({ id }));
  expect(blob.del).toHaveBeenCalledWith(imageUrl);
});
