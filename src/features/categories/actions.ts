"use server";

// Server actions (mutations): Owner-managed categories (FR-043). Leaf 3.3.
// Names are unique regardless of case. A category that still has products can't be deleted;
// the database's onDelete: Restrict backs this up if a product is added at the same moment.
// Each change can also come from a device through /api/sync (leaf 9.4) with its own UUID; it is
// then applied at most once, and a replay returns the first result.
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/auth";
import { findReceipt, runWithReceipt } from "@/lib/commands";
import { db, type Tx } from "@/lib/db";
import { fail, invalid, ok, type Result } from "@/lib/result";
import type { CategoryOption } from "./queries";
import {
  createCategorySchema,
  deleteCategorySchema,
  renameCategorySchema,
  type CreateCategoryInput,
  type DeleteCategoryInput,
  type RenameCategoryInput,
} from "./schemas";

const CATEGORIES_PATH = "/categories";

function duplicateName(name: string): Result<never> {
  const message = `There is already a category called “${name}”.`;
  return fail("CONFLICT", message, { name: [message] });
}

/** Unexpected database failure: logged on the server, never sent to the client. */
function unexpected(err: unknown): Result<never> {
  console.error("category action failed", err);
  return fail("CONFLICT", "The change couldn't be saved. Please try again.");
}

function isPrismaError(err: unknown, ...codes: string[]): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && codes.includes(err.code);
}

/** Thrown inside a transaction to roll it back and return this result instead. */
class Refusal extends Error {
  constructor(readonly result: Result<never>) {
    super(result.ok ? "" : result.error.message);
  }
}

/** Another category with this name, ignoring case ("bags" clashes with "Bags"). */
async function nameTaken(name: string, exceptId?: string, tx: Tx = db): Promise<boolean> {
  const clash = await tx.category.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  return clash !== null;
}

export async function createCategory(input: CreateCategoryInput): Promise<Result<CategoryOption>> {
  const auth = await requireCapability("categories.manage");
  if (!auth.ok) return auth;
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, name } = parsed.data;

  const earlier = await findReceipt<CategoryOption>(id);
  if (earlier) return ok(earlier);
  try {
    const outcome = await runWithReceipt(id, "CATEGORY_CREATE", auth.data.id, async (tx) => {
      if (await nameTaken(name, undefined, tx)) throw new Refusal(duplicateName(name));
      return tx.category.create({ data: { id, name }, select: { id: true, name: true } });
    });
    revalidatePath(CATEGORIES_PATH);
    return ok(outcome.result);
  } catch (err) {
    if (err instanceof Refusal) return err.result;
    if (isPrismaError(err, "P2002")) return duplicateName(name);
    return unexpected(err);
  }
}

export async function renameCategory(input: RenameCategoryInput): Promise<Result<CategoryOption>> {
  const auth = await requireCapability("categories.manage");
  if (!auth.ok) return auth;
  const parsed = renameCategorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, commandId, name } = parsed.data;

  const earlier = await findReceipt<CategoryOption>(commandId);
  if (earlier) return ok(earlier);
  try {
    const outcome = await runWithReceipt(commandId, "CATEGORY_RENAME", auth.data.id, async (tx) => {
      if (await nameTaken(name, id, tx)) throw new Refusal(duplicateName(name));
      return tx.category.update({
        where: { id },
        data: { name },
        select: { id: true, name: true },
      });
    });
    revalidatePath(CATEGORIES_PATH);
    return ok(outcome.result);
  } catch (err) {
    if (err instanceof Refusal) return err.result;
    if (isPrismaError(err, "P2025")) return fail("NOT_FOUND", "That category no longer exists.");
    if (isPrismaError(err, "P2002")) return duplicateName(name);
    return unexpected(err);
  }
}

/** FR-043: refuses while any product is in the category. */
export async function deleteCategory(input: DeleteCategoryInput): Promise<Result<{ id: string }>> {
  const auth = await requireCapability("categories.manage");
  if (!auth.ok) return auth;
  const parsed = deleteCategorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, commandId } = parsed.data;

  const earlier = await findReceipt<{ id: string }>(commandId);
  if (earlier) return ok(earlier);
  const category = await db.category.findUnique({
    where: { id },
    select: { name: true, _count: { select: { products: true } } },
  });
  if (!category) return fail("NOT_FOUND", "That category no longer exists.");
  const inUse = (count: number) =>
    fail(
      "CONFLICT",
      `“${category.name}” still has ${count === 1 ? "1 product" : `${count} products`}. ` +
        "Move them to another category or delete them first.",
    );
  if (category._count.products > 0) return inUse(category._count.products);

  try {
    await runWithReceipt(commandId, "CATEGORY_DELETE", auth.data.id, async (tx) => {
      await tx.category.delete({ where: { id } });
      return { id };
    });
  } catch (err) {
    if (isPrismaError(err, "P2025")) return fail("NOT_FOUND", "That category no longer exists.");
    // A product was added between the check and the delete.
    if (isPrismaError(err, "P2003")) {
      return inUse(await db.product.count({ where: { categoryId: id } }));
    }
    return unexpected(err);
  }
  revalidatePath(CATEGORIES_PATH);
  return ok({ id });
}
