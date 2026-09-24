import { beforeEach, expect, test, vi } from "vitest";
import { createCategory, deleteCategory, renameCategory } from "@/features/categories/actions";
import { listCategories, listCategoryOptions } from "@/features/categories/queries";
import { createSupplier, deleteSupplier, updateSupplier } from "@/features/suppliers/actions";
import { listSupplierOptions, listSuppliers } from "@/features/suppliers/queries";
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

const DENIED = { ok: false, error: { code: "FORBIDDEN" } };

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

// ---- Categories (FR-043) ----------------------------------------------------------

test("[FR-043] the owner adds, renames, and deletes a category", async () => {
  await signInAs("OWNER");
  const bags = unwrap(await createCategory({ name: "  Bags " }));
  expect(bags.name).toBe("Bags");

  expect(await renameCategory({ id: bags.id, name: "Handbags" })).toMatchObject({
    ok: true,
    data: { name: "Handbags" },
  });
  expect(unwrap(await listCategories())).toEqual([
    { id: bags.id, name: "Handbags", productCount: 0 },
  ]);

  expect(await deleteCategory({ id: bags.id })).toMatchObject({ ok: true });
  expect(await db.category.count()).toBe(0);
});

test("[FR-043] category names are unique regardless of case, and can't be blank", async () => {
  await signInAs("OWNER");
  const bags = unwrap(await createCategory({ name: "Bags" }));
  const perfumes = unwrap(await createCategory({ name: "Perfumes" }));

  expect(await createCategory({ name: "bags" })).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", fieldErrors: { name: [expect.stringMatching(/already/)] } },
  });
  expect(await renameCategory({ id: perfumes.id, name: "BAGS" })).toMatchObject({
    ok: false,
    error: { code: "CONFLICT" },
  });
  // Changing only the case of a category's own name is fine.
  expect(await renameCategory({ id: bags.id, name: "BAGS" })).toMatchObject({ ok: true });
  expect(await createCategory({ name: "   " })).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", fieldErrors: { name: [expect.any(String)] } },
  });
  expect(await db.category.count()).toBe(2);
});

test("[FR-043-INUSE] a category that still has products can't be deleted", async () => {
  await signInAs("OWNER");
  const bags = await makeCategory("Bags");
  const product = await makeProduct(bags.id);

  const result = await deleteCategory({ id: bags.id });
  expect(result).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", message: expect.stringMatching(/still has 1 product/) },
  });
  expect(await db.category.count({ where: { id: bags.id } })).toBe(1);
  expect(unwrap(await listCategories())).toEqual([{ id: bags.id, name: "Bags", productCount: 1 }]);

  // Once the product is gone, the category can be deleted.
  await db.product.delete({ where: { id: product.id } });
  expect(await deleteCategory({ id: bags.id })).toMatchObject({ ok: true });
});

test("[FR-043-INUSE] the database also refuses deleting a category that has products", async () => {
  const bags = await makeCategory("Bags");
  await makeProduct(bags.id);
  await expect(db.category.delete({ where: { id: bags.id } })).rejects.toMatchObject({
    code: "P2003",
  });
});

test("[FR-043] staff can read category names but can't change categories", async () => {
  const bags = await makeCategory("Bags");
  await signInAs("STAFF");

  expect(await listCategoryOptions()).toEqual({ ok: true, data: [{ id: bags.id, name: "Bags" }] });
  expect(await listCategories()).toMatchObject(DENIED);
  expect(await createCategory({ name: "Shoes" })).toMatchObject(DENIED);
  expect(await renameCategory({ id: bags.id, name: "Totes" })).toMatchObject(DENIED);
  expect(await deleteCategory({ id: bags.id })).toMatchObject(DENIED);
  expect(await db.category.findMany({ select: { name: true } })).toEqual([{ name: "Bags" }]);
});

// ---- Suppliers (FR-041, FR-042) ---------------------------------------------------

test("[FR-041] the owner adds a supplier with name and contact details", async () => {
  await signInAs("OWNER");
  const supplier = unwrap(
    await createSupplier({
      name: " Manila Leather Co. ",
      contactPerson: "Ana Reyes",
      phone: "0917 123 4567",
      email: "Orders@ManilaLeather.ph",
      address: "Divisoria, Manila",
    }),
  );
  expect(supplier).toMatchObject({
    name: "Manila Leather Co.",
    contactPerson: "Ana Reyes",
    phone: "0917 123 4567",
    email: "orders@manilaleather.ph",
    address: "Divisoria, Manila",
    productCount: 0,
  });

  // Contact details are optional; blanks are stored as null.
  const minimal = unwrap(await createSupplier({ name: "Local Maker", phone: "  ", email: "" }));
  expect(minimal).toMatchObject({ contactPerson: null, phone: null, email: null, address: null });
  expect(unwrap(await listSuppliers()).map((s) => s.name)).toEqual([
    "Local Maker",
    "Manila Leather Co.",
  ]);
});

test("[FR-041] supplier input is validated", async () => {
  await signInAs("OWNER");
  expect(await createSupplier({ name: "", email: "not-an-email" })).toMatchObject({
    ok: false,
    error: {
      code: "VALIDATION",
      fieldErrors: { name: [expect.any(String)], email: [expect.any(String)] },
    },
  });
  expect(await db.supplier.count()).toBe(0);
});

test("[FR-041] the owner edits a supplier", async () => {
  await signInAs("OWNER");
  const supplier = unwrap(await createSupplier({ name: "Manila Leather", phone: "0917" }));
  const updated = await updateSupplier({
    id: supplier.id,
    name: "Manila Leather Co.",
    contactPerson: "Ana",
    phone: "",
  });
  expect(updated).toMatchObject({
    ok: true,
    data: { name: "Manila Leather Co.", contactPerson: "Ana", phone: null },
  });
  expect(await updateSupplier({ id: "missing", name: "X" })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
});

test("[FR-041] deleting a supplier keeps its products and clears their supplier", async () => {
  await signInAs("OWNER");
  const supplier = unwrap(await createSupplier({ name: "Manila Leather" }));
  const category = await makeCategory("Bags");
  const product = await makeProduct(category.id);
  await db.product.update({ where: { id: product.id }, data: { supplierId: supplier.id } });

  expect(await deleteSupplier({ id: supplier.id })).toEqual({
    ok: true,
    data: { id: supplier.id, productsUnlinked: 1 },
  });
  expect(await db.supplier.count()).toBe(0);
  expect(await db.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({
    supplierId: null,
  });
  expect(await deleteSupplier({ id: supplier.id })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
});

test("[FR-042-STAFF] staff can't see or change supplier records", async () => {
  await signInAs("OWNER");
  const supplier = unwrap(await createSupplier({ name: "Manila Leather", phone: "0917" }));
  await signInAs("STAFF");

  expect(await listSuppliers()).toMatchObject(DENIED);
  expect(await listSupplierOptions()).toMatchObject(DENIED);
  expect(await createSupplier({ name: "Sneaky Supply" })).toMatchObject(DENIED);
  expect(await updateSupplier({ id: supplier.id, name: "Renamed" })).toMatchObject(DENIED);
  expect(await deleteSupplier({ id: supplier.id })).toMatchObject(DENIED);

  // Nothing leaked into the denial and nothing changed.
  const denial = JSON.stringify(await listSuppliers());
  expect(denial).not.toContain("Manila Leather");
  expect(await db.supplier.findMany({ select: { name: true, phone: true } })).toEqual([
    { name: "Manila Leather", phone: "0917" },
  ]);
});

test("[FR-042-STAFF] signed-out callers can't read suppliers or categories", async () => {
  await makeCategory("Bags");
  const unauthorized = { ok: false, error: { code: "UNAUTHORIZED" } };
  expect(await listSuppliers()).toMatchObject(unauthorized);
  expect(await listCategoryOptions()).toMatchObject(unauthorized);
  expect(await createSupplier({ name: "Anon" })).toMatchObject(unauthorized);
});
