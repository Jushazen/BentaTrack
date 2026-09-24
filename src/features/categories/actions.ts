"use server";

// Server actions (mutations): Owner-managed categories (FR-043). Leaf 3.3.
// Names are unique regardless of case. A category that still has products can't be deleted;
// the database's onDelete: Restrict backs this up if a product is added at the same moment.
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
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

/** Another category with this name, ignoring case ("bags" clashes with "Bags"). */
async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  const clash = await db.category.findFirst({
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
  const { name } = parsed.data;

  if (await nameTaken(name)) return duplicateName(name);
  try {
    const category = await db.category.create({ data: { name }, select: { id: true, name: true } });
    revalidatePath(CATEGORIES_PATH);
    return ok(category);
  } catch (err) {
    if (isPrismaError(err, "P2002")) return duplicateName(name);
    return unexpected(err);
  }
}

export async function renameCategory(input: RenameCategoryInput): Promise<Result<CategoryOption>> {
  const auth = await requireCapability("categories.manage");
  if (!auth.ok) return auth;
  const parsed = renameCategorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, name } = parsed.data;

  if (await nameTaken(name, id)) return duplicateName(name);
  try {
    const category = await db.category.update({
      where: { id },
      data: { name },
      select: { id: true, name: true },
    });
    revalidatePath(CATEGORIES_PATH);
    return ok(category);
  } catch (err) {
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
  const { id } = parsed.data;

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
    await db.category.delete({ where: { id } });
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
