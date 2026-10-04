"use server";

// Server actions (mutations): Product records (FR-001–006, FR-037). Leaf 3.2.
// Forms post FormData because they can carry a photo. Staff may add and edit products but never
// set or see purchase price or supplier (FR-032, A7 follow-on). Only the owner archives and restores
// discontinued products; nothing is ever deleted (FR-004, H1).
// Every add, edit, archive, and restore writes an InventoryChange row (FR-012, FR-058).
// Each can also come from a device through /api/sync (leaf 9.4): it then carries the change's
// UUID and the device's time, and is applied at most once (a replay returns the first result).
import { revalidatePath } from "next/cache";
import type { LowStockAlert } from "@/components/layout/low-stock-alerts";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability, type SessionUser } from "@/lib/auth";
import { findReceipt, runWithReceipt } from "@/lib/commands";
import { db, type Tx } from "@/lib/db";
import { recordInventoryChange } from "@/lib/inventory-log";
import { formatPeso } from "@/lib/money";
import { can } from "@/lib/permissions";
import { fail, invalid, ok, type Result } from "@/lib/result";
import { stockStatus, type StockStatus } from "@/lib/stock-status";
import { ImageStorageError, deleteProductImage, storeProductImage } from "@/lib/storage";
import {
  createProductSchema,
  formToObject,
  productIdSchema,
  updateProductSchema,
  type CreateProductInput,
  type ProductIdInput,
  type UpdateProductInput,
} from "./schemas";

const PRODUCTS_PATH = "/products";
const GONE = "That product no longer exists.";
const ARCHIVED = "This product is archived. Restore it first.";

export type SavedProduct = { id: string; name: string; lowStockAlerts: LowStockAlert[] };

/** Unexpected failure: logged on the server, never sent to the client. */
function unexpected(err: unknown): Result<never> {
  console.error("product action failed", err);
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

function fieldError(field: string, message: string): Result<never> {
  return fail("VALIDATION", message, { [field]: [message] });
}

/** Staff may not set purchase price or supplier, even by crafting a request. */
function ownerFieldsAllowed(
  user: SessionUser,
  input: { purchasePrice?: number | null; supplierId?: string | null },
): Result<never> | null {
  if (input.purchasePrice !== undefined && !can(user.role, "products.cost")) {
    return fail("FORBIDDEN", "Only the owner can set purchase prices.");
  }
  if (input.supplierId !== undefined && !can(user.role, "suppliers.read")) {
    return fail("FORBIDDEN", "Only the owner can set a product's supplier.");
  }
  return null;
}

/** Friendly errors for a missing category/supplier or a code/barcode already in use. */
async function referenceProblems(
  input: Pick<CreateProductInput, "categoryId" | "supplierId" | "code" | "barcode">,
  exceptId?: string,
): Promise<Result<never> | null> {
  const [category, supplier, clash] = await Promise.all([
    db.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }),
    input.supplierId
      ? db.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } })
      : null,
    db.product.findFirst({
      where: {
        OR: [
          { code: { equals: input.code, mode: "insensitive" } },
          ...(input.barcode
            ? [{ barcode: { equals: input.barcode, mode: "insensitive" as const } }]
            : []),
        ],
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { name: true, code: true, barcode: true, archivedAt: true },
    }),
  ]);
  if (!category) return fieldError("categoryId", "That category no longer exists. Choose another.");
  if (input.supplierId && !supplier) {
    return fieldError("supplierId", "That supplier no longer exists. Choose another.");
  }
  if (clash) {
    // Archived products keep their code and barcode reserved (FR-059).
    const owner = clash.archivedAt ? `${clash.name} (archived)` : clash.name;
    const sameCode = clash.code.toLowerCase() === input.code.toLowerCase();
    return sameCode
      ? fail("CONFLICT", `Code ${clash.code} is already used by ${owner}.`, {
          code: [`Already used by ${owner}.`],
        })
      : fail("CONFLICT", `That barcode is already used by ${owner}.`, {
          barcode: [`Already used by ${owner}.`],
        });
  }
  return null;
}

/** A unique index caught a clash that appeared after referenceProblems() checked. */
function duplicateCodeOrBarcode(): Result<never> {
  return fail("CONFLICT", "Another product already uses that code or barcode.");
}

async function storeImage(file: File | undefined): Promise<Result<string | null>> {
  if (!file) return ok(null);
  try {
    return ok(await storeProductImage(file));
  } catch (err) {
    if (err instanceof ImageStorageError) return fieldError("image", err.message);
    return unexpected(err);
  }
}

const STATUS_RANK: Record<StockStatus, number> = { ACTIVE: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 };

function lowStockAlertsFor(
  before: { stockQuantity: number; lowStockThreshold: number },
  after: { id: string; name: string; stockQuantity: number; lowStockThreshold: number },
): LowStockAlert[] {
  const was = stockStatus(before.stockQuantity, before.lowStockThreshold);
  const now = stockStatus(after.stockQuantity, after.lowStockThreshold);
  if (STATUS_RANK[now] <= STATUS_RANK[was]) return [];
  return [
    {
      productId: after.id,
      name: after.name,
      quantity: after.stockQuantity,
      threshold: after.lowStockThreshold,
    },
  ];
}

/** Locks the product row so a sale or restock can't change stock mid-edit. */
async function lockProduct(tx: Tx, id: string) {
  await tx.$queryRaw`select 1 from "Product" where id = ${id} for update`;
  return tx.product.findUnique({
    where: { id },
    include: { category: { select: { name: true } } },
  });
}

// ---- Create (FR-001, FR-002) --------------------------------------------------------

export async function createProduct(formData: FormData): Promise<Result<SavedProduct>> {
  const auth = await requireCapability("products.create");
  if (!auth.ok) return auth;
  const user = auth.data;
  const parsed = createProductSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error.issues);
  const input = parsed.data;

  // A replay of a product a device already added: answer as the first time (FR-036).
  const earlier = await findReceipt<SavedProduct>(input.id);
  if (earlier) return ok(earlier);

  const refused = ownerFieldsAllowed(user, input) ?? (await referenceProblems(input));
  if (refused) return refused;
  const image = await storeImage(input.image);
  if (!image.ok) return image;

  try {
    const outcome = await runWithReceipt(input.id, "PRODUCT_CREATE", user.id, async (tx) => {
      const created = await tx.product.create({
        data: {
          id: input.id,
          name: input.name,
          code: input.code,
          barcode: input.barcode,
          categoryId: input.categoryId,
          brand: input.brand,
          supplierId: input.supplierId ?? null,
          purchasePrice: input.purchasePrice ?? null,
          sellingPrice: input.sellingPrice,
          stockQuantity: input.stockQuantity,
          lowStockThreshold: input.lowStockThreshold,
          expirationDate: input.expirationDate,
          imageUrl: image.data,
        },
        select: { id: true, name: true },
      });
      await recordInventoryChange(tx, {
        productId: created.id,
        type: "EDIT",
        quantityChange: input.stockQuantity,
        userId: user.id,
        occurredAt: input.occurredAt ?? new Date(),
        note: "Product added",
      });
      return { ...created, lowStockAlerts: [] } satisfies SavedProduct;
    });
    if (outcome.replayed) await deleteProductImage(image.data);
    revalidatePath(PRODUCTS_PATH);
    return ok(outcome.result);
  } catch (err) {
    await deleteProductImage(image.data);
    if (isPrismaError(err, "P2002")) return duplicateCodeOrBarcode();
    return unexpected(err);
  }
}

// ---- Edit (FR-003, EDIT-LOG) --------------------------------------------------------

function dateText(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "none";
}

/**
 * One line per changed field for the inventory history. Staff can read the history, so cost and
 * supplier changes are mentioned without their values (FR-032).
 */
function describeChanges(
  before: NonNullable<Awaited<ReturnType<typeof lockProduct>>>,
  after: Prisma.ProductUncheckedUpdateInput & { categoryName: string },
): string[] {
  const changes: string[] = [];
  const text = (label: string, from: string | null, to: unknown) => {
    if (to !== undefined && to !== from)
      changes.push(`${label}: ${from ?? "none"} → ${to ?? "none"}`);
  };
  text("Name", before.name, after.name);
  text("Code", before.code, after.code);
  text("Barcode", before.barcode, after.barcode);
  if (after.categoryId !== before.categoryId) {
    changes.push(`Category: ${before.category.name} → ${after.categoryName}`);
  }
  text("Brand", before.brand, after.brand);
  if (after.sellingPrice !== before.sellingPrice) {
    changes.push(
      `Selling price: ${formatPeso(before.sellingPrice)} → ${formatPeso(after.sellingPrice as number)}`,
    );
  }
  if (after.stockQuantity !== undefined && after.stockQuantity !== before.stockQuantity) {
    changes.push(`Stock: ${before.stockQuantity} → ${after.stockQuantity as number}`);
  }
  if (after.lowStockThreshold !== before.lowStockThreshold) {
    changes.push(
      `Low stock threshold: ${before.lowStockThreshold} → ${after.lowStockThreshold as number}`,
    );
  }
  const newExpiry = after.expirationDate as Date | null;
  if (dateText(newExpiry) !== dateText(before.expirationDate)) {
    changes.push(`Expiration date: ${dateText(before.expirationDate)} → ${dateText(newExpiry)}`);
  }
  if (after.purchasePrice !== undefined && after.purchasePrice !== before.purchasePrice) {
    changes.push("Purchase price updated");
  }
  if (after.supplierId !== undefined && after.supplierId !== before.supplierId) {
    changes.push("Supplier updated");
  }
  if (after.imageUrl !== undefined && after.imageUrl !== before.imageUrl) {
    changes.push(after.imageUrl ? "Photo changed" : "Photo removed");
  }
  return changes;
}

export async function updateProduct(formData: FormData): Promise<Result<SavedProduct>> {
  const auth = await requireCapability("products.update");
  if (!auth.ok) return auth;
  const user = auth.data;
  const parsed = updateProductSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error.issues);
  const input: UpdateProductInput = parsed.data;

  const earlier = await findReceipt<SavedProduct>(input.commandId);
  if (earlier) return ok(earlier);

  const refused = ownerFieldsAllowed(user, input) ?? (await referenceProblems(input, input.id));
  if (refused) return refused;
  const image = await storeImage(input.image);
  if (!image.ok) return image;

  let oldImage: string | null = null;
  try {
    const outcome = await runWithReceipt(input.commandId, "PRODUCT_UPDATE", user.id, async (tx) => {
      oldImage = null;
      const before = await lockProduct(tx, input.id);
      if (!before) throw new Refusal(fail("NOT_FOUND", GONE));
      if (before.archivedAt) throw new Refusal(fail("CONFLICT", ARCHIVED));

      // Only touch stock when the user changed it, and only if nothing else (a sale, a
      // restock) changed it since the form was opened.
      const stockEdited = input.stockQuantity !== input.stockWhenLoaded;
      if (stockEdited && before.stockQuantity !== input.stockWhenLoaded) {
        const message =
          `Stock changed to ${before.stockQuantity} while you were editing. ` +
          "Check the new count and save again.";
        throw new Refusal(fail("CONFLICT", message, { stockQuantity: [message] }));
      }

      const imageUrl = image.data ?? (input.removeImage ? null : undefined);
      const data = {
        name: input.name,
        code: input.code,
        barcode: input.barcode,
        categoryId: input.categoryId,
        brand: input.brand,
        sellingPrice: input.sellingPrice,
        lowStockThreshold: input.lowStockThreshold,
        expirationDate: input.expirationDate,
        ...(stockEdited && { stockQuantity: input.stockQuantity }),
        ...(input.purchasePrice !== undefined && { purchasePrice: input.purchasePrice }),
        ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
        ...(imageUrl !== undefined && { imageUrl }),
      } satisfies Prisma.ProductUncheckedUpdateInput;

      const categoryName =
        input.categoryId === before.categoryId
          ? before.category.name
          : ((await tx.category.findUnique({ where: { id: input.categoryId } }))?.name ?? "");
      const changes = describeChanges(before, { ...data, categoryName });
      if (changes.length === 0) {
        return { id: before.id, name: before.name, lowStockAlerts: [] };
      }

      const after = await tx.product.update({
        where: { id: input.id },
        data,
        select: { id: true, name: true, stockQuantity: true, lowStockThreshold: true },
      });
      await recordInventoryChange(tx, {
        productId: after.id,
        type: "EDIT",
        quantityChange: after.stockQuantity - before.stockQuantity,
        userId: user.id,
        occurredAt: input.occurredAt ?? new Date(),
        note: changes.join("; ").slice(0, 1000),
      });
      if (imageUrl !== undefined && before.imageUrl !== imageUrl) oldImage = before.imageUrl;
      return { id: after.id, name: after.name, lowStockAlerts: lowStockAlertsFor(before, after) };
    });
    // A replay changed nothing: the new upload is unused and the old photo still in use.
    await deleteProductImage(outcome.replayed ? image.data : oldImage);
    revalidatePath(PRODUCTS_PATH);
    revalidatePath(`${PRODUCTS_PATH}/${input.id}`);
    return ok(outcome.result);
  } catch (err) {
    await deleteProductImage(image.data);
    if (err instanceof Refusal) return err.result;
    if (isPrismaError(err, "P2002")) return duplicateCodeOrBarcode();
    return unexpected(err);
  }
}

// ---- Archive and restore (FR-004, FR-057–059) ---------------------------------------

/**
 * Owner only. Sets or clears archivedAt and logs it with a zero quantity change. Stock, photo, and
 * every other detail are kept, so restoring brings the product back exactly as it was (FR-058).
 */
async function setArchived(
  input: ProductIdInput,
  archive: boolean,
): Promise<Result<{ id: string; name: string }>> {
  const auth = await requireCapability("products.archive");
  if (!auth.ok) return auth;
  const parsed = productIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, commandId, occurredAt } = parsed.data;
  const kind = archive ? "PRODUCT_ARCHIVE" : "PRODUCT_RESTORE";

  try {
    const outcome = await runWithReceipt(commandId, kind, auth.data.id, async (tx) => {
      const before = await lockProduct(tx, id);
      if (!before) throw new Refusal(fail("NOT_FOUND", GONE));
      if (Boolean(before.archivedAt) === archive) {
        const state = archive ? "already archived" : "not archived";
        throw new Refusal(fail("CONFLICT", `${before.name} is ${state}.`));
      }
      await tx.product.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
      await recordInventoryChange(tx, {
        productId: id,
        type: archive ? "ARCHIVE" : "RESTORE",
        quantityChange: 0,
        userId: auth.data.id,
        occurredAt: occurredAt ?? new Date(),
        note: archive ? "Product archived (discontinued)" : "Product restored",
      });
      return { id, name: before.name };
    });
    revalidatePath(PRODUCTS_PATH);
    revalidatePath(`${PRODUCTS_PATH}/${id}`);
    return ok(outcome.result);
  } catch (err) {
    if (err instanceof Refusal) return err.result;
    return unexpected(err);
  }
}

/** Owner only. Hides a discontinued product from selling, search, and stock figures (FR-057). */
export async function archiveProduct(
  input: ProductIdInput,
): Promise<Result<{ id: string; name: string }>> {
  return setArchived(input, true);
}

/** Owner only. Puts an archived product back in use, unchanged. */
export async function restoreProduct(
  input: ProductIdInput,
): Promise<Result<{ id: string; name: string }>> {
  return setArchived(input, false);
}
