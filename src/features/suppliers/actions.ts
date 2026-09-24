"use server";

// Server actions (mutations): Owner-only supplier records (FR-041–042). Leaf 3.3.
// Deleting a supplier keeps its products; their supplier link is cleared (onDelete: SetNull).
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, invalid, ok, type Result } from "@/lib/result";
import { supplierRowSelect, toSupplierRow, type SupplierRow } from "./queries";
import {
  createSupplierSchema,
  deleteSupplierSchema,
  updateSupplierSchema,
  type DeleteSupplierInput,
  type SupplierInput,
  type UpdateSupplierInput,
} from "./schemas";

const SUPPLIERS_PATH = "/suppliers";
const GONE = "That supplier no longer exists.";

/** Unexpected database failure: logged on the server, never sent to the client. */
function unexpected(err: unknown): Result<never> {
  console.error("supplier action failed", err);
  return fail("CONFLICT", "The change couldn't be saved. Please try again.");
}

function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

export async function createSupplier(input: SupplierInput): Promise<Result<SupplierRow>> {
  const auth = await requireCapability("suppliers.manage");
  if (!auth.ok) return auth;
  const parsed = createSupplierSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  try {
    const supplier = await db.supplier.create({ data: parsed.data, select: supplierRowSelect });
    revalidatePath(SUPPLIERS_PATH);
    return ok(toSupplierRow(supplier));
  } catch (err) {
    return unexpected(err);
  }
}

export async function updateSupplier(input: UpdateSupplierInput): Promise<Result<SupplierRow>> {
  const auth = await requireCapability("suppliers.manage");
  if (!auth.ok) return auth;
  const parsed = updateSupplierSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, ...data } = parsed.data;

  try {
    const supplier = await db.supplier.update({ where: { id }, data, select: supplierRowSelect });
    revalidatePath(SUPPLIERS_PATH);
    return ok(toSupplierRow(supplier));
  } catch (err) {
    if (isNotFound(err)) return fail("NOT_FOUND", GONE);
    return unexpected(err);
  }
}

/** Returns how many products lost their supplier link. */
export async function deleteSupplier(
  input: DeleteSupplierInput,
): Promise<Result<{ id: string; productsUnlinked: number }>> {
  const auth = await requireCapability("suppliers.manage");
  if (!auth.ok) return auth;
  const parsed = deleteSupplierSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id } = parsed.data;

  try {
    const productsUnlinked = await db.$transaction(async (tx) => {
      const count = await tx.product.count({ where: { supplierId: id } });
      await tx.supplier.delete({ where: { id } });
      return count;
    });
    revalidatePath(SUPPLIERS_PATH);
    return ok({ id, productsUnlinked });
  } catch (err) {
    if (isNotFound(err)) return fail("NOT_FOUND", GONE);
    return unexpected(err);
  }
}
