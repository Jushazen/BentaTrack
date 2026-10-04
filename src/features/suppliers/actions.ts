"use server";

// Server actions (mutations): Owner-only supplier records (FR-041–042). Leaf 3.3.
// Deleting a supplier keeps its products; their supplier link is cleared (onDelete: SetNull).
// Each change can also come from a device through /api/sync (leaf 9.4) with its own UUID; it is
// then applied at most once, and a replay returns the first result.
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/auth";
import { findReceipt, runWithReceipt } from "@/lib/commands";
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

  const earlier = await findReceipt<SupplierRow>(parsed.data.id);
  if (earlier) return ok(earlier);
  try {
    const outcome = await runWithReceipt(
      parsed.data.id,
      "SUPPLIER_CREATE",
      auth.data.id,
      async (tx) =>
        toSupplierRow(await tx.supplier.create({ data: parsed.data, select: supplierRowSelect })),
    );
    revalidatePath(SUPPLIERS_PATH);
    return ok(outcome.result);
  } catch (err) {
    return unexpected(err);
  }
}

export async function updateSupplier(input: UpdateSupplierInput): Promise<Result<SupplierRow>> {
  const auth = await requireCapability("suppliers.manage");
  if (!auth.ok) return auth;
  const parsed = updateSupplierSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, commandId, ...data } = parsed.data;

  const earlier = await findReceipt<SupplierRow>(commandId);
  if (earlier) return ok(earlier);
  try {
    const outcome = await runWithReceipt(commandId, "SUPPLIER_UPDATE", auth.data.id, async (tx) =>
      toSupplierRow(await tx.supplier.update({ where: { id }, data, select: supplierRowSelect })),
    );
    revalidatePath(SUPPLIERS_PATH);
    return ok(outcome.result);
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
  const { id, commandId } = parsed.data;

  const earlier = await findReceipt<{ id: string; productsUnlinked: number }>(commandId);
  if (earlier) return ok(earlier);
  try {
    const outcome = await runWithReceipt(commandId, "SUPPLIER_DELETE", auth.data.id, async (tx) => {
      const productsUnlinked = await tx.product.count({ where: { supplierId: id } });
      await tx.supplier.delete({ where: { id } });
      return { id, productsUnlinked };
    });
    revalidatePath(SUPPLIERS_PATH);
    return ok(outcome.result);
  } catch (err) {
    if (isNotFound(err)) return fail("NOT_FOUND", GONE);
    return unexpected(err);
  }
}
