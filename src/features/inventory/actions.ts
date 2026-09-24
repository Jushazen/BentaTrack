"use server";

// Server actions (mutations): Restock (FR-038, amendment B2). Leaf 3.4.
// Restock is idempotent by its client-generated id (FR-036): the InventoryChange row it writes
// uses that id, so replaying the same restock returns the first result without adding stock twice.
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth";
import { runIdempotent } from "@/lib/commands";
import type { Tx } from "@/lib/db";
import { recordInventoryChange } from "@/lib/inventory-log";
import { fail, invalid, ok, type Result } from "@/lib/result";
import { MAX_STOCK, restockSchema, type RestockInput } from "./schemas";

export type RestockResult = {
  /** The InventoryChange id, which is also the command id. */
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  stockAfter: number;
  /** True when this id was already applied and the earlier result is returned. */
  replayed: boolean;
};

/** Thrown inside the transaction to roll it back and return this result instead. */
class Refusal extends Error {
  constructor(readonly result: Result<never>) {
    super(result.ok ? "" : result.error.message);
  }
}

async function findRestock(tx: Tx, id: string): Promise<Omit<RestockResult, "replayed"> | null> {
  const change = await tx.inventoryChange.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      productId: true,
      productName: true,
      quantityChange: true,
      stockAfter: true,
    },
  });
  if (!change) return null;
  if (change.type !== "RESTOCK") {
    throw new Refusal(fail("CONFLICT", "That id belongs to a different change. Try again."));
  }
  return {
    id: change.id,
    productId: change.productId,
    productName: change.productName,
    quantity: change.quantityChange,
    stockAfter: change.stockAfter,
  };
}

export async function restockProduct(input: RestockInput): Promise<Result<RestockResult>> {
  const auth = await requireCapability("inventory.restock");
  if (!auth.ok) return auth;
  const parsed = restockSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, occurredAt, productId, quantity, note } = parsed.data;

  try {
    const outcome = await runIdempotent({
      id,
      findExisting: findRestock,
      apply: async (tx) => {
        await tx.$queryRaw`select 1 from "Product" where id = ${productId} for update`;
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { stockQuantity: true },
        });
        if (!product) throw new Refusal(fail("NOT_FOUND", "That product no longer exists."));
        if (product.stockQuantity + quantity > MAX_STOCK) {
          const message = `Stock can't go above ${MAX_STOCK.toLocaleString("en-PH")} units.`;
          throw new Refusal(fail("VALIDATION", message, { quantity: [message] }));
        }
        await tx.product.update({
          where: { id: productId },
          data: { stockQuantity: { increment: quantity } },
        });
        const change = await recordInventoryChange(tx, {
          id,
          productId,
          type: "RESTOCK",
          quantityChange: quantity,
          userId: auth.data.id,
          occurredAt,
          note,
        });
        return {
          id: change.id,
          productId,
          productName: change.productName,
          quantity,
          stockAfter: change.stockAfter,
        };
      },
    });
    revalidatePath("/products");
    if (outcome.result.productId) revalidatePath(`/products/${outcome.result.productId}`);
    revalidatePath("/inventory-history");
    return ok({ ...outcome.result, replayed: outcome.replayed });
  } catch (err) {
    if (err instanceof Refusal) return err.result;
    console.error("restock failed", err);
    return fail("CONFLICT", "The restock couldn't be saved. Please try again.");
  }
}
