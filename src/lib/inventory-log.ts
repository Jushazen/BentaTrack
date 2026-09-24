// Writes one InventoryChange row (FR-010–012, §5.2) inside the caller's transaction.
import { randomUUID } from "node:crypto";
import type { InventoryChangeType } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";

export type InventoryChangeInput = {
  productId: string;
  type: InventoryChangeType;
  /** Signed change already applied to the product's stock (0 for detail edits). */
  quantityChange: number;
  userId: string;
  occurredAt: Date;
  saleId?: string;
  refundId?: string;
  note?: string;
  /** Client-generated UUID when replaying offline work; generated here otherwise. */
  id?: string;
};

/**
 * Call AFTER updating the product's stock in the same transaction. Reads the product's
 * current stock as `stockAfter` and snapshots its name and code so history survives deletion.
 */
export async function recordInventoryChange(tx: Tx, input: InventoryChangeInput) {
  const product = await tx.product.findUniqueOrThrow({
    where: { id: input.productId },
    select: { name: true, code: true, stockQuantity: true },
  });
  return tx.inventoryChange.create({
    data: {
      id: input.id ?? randomUUID(),
      productId: input.productId,
      productName: product.name,
      productCode: product.code,
      type: input.type,
      quantityChange: input.quantityChange,
      stockAfter: product.stockQuantity,
      userId: input.userId,
      occurredAt: input.occurredAt,
      saleId: input.saleId,
      refundId: input.refundId,
      note: input.note,
    },
  });
}
