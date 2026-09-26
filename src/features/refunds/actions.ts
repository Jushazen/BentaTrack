"use server";

// Server actions (mutations): Refunds (FR-012, FR-039, FR-040; amendment C7). Leaf 4.2.
// refundSale is idempotent by its client-generated id (FR-036): the Refund row uses that id, so
// replaying the same refund returns the first result without returning stock or money twice.
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/auth";
import { runIdempotent } from "@/lib/commands";
import type { Tx } from "@/lib/db";
import { recordInventoryChange } from "@/lib/inventory-log";
import { fail, invalid, ok, type Result } from "@/lib/result";
import { refundAmounts } from "./refund-math";
import { refundLineKey, refundSaleSchema, type RefundSaleInput } from "./schemas";

export type RefundResult = {
  /** The Refund id, which is also the command id. */
  id: string;
  saleId: string;
  /** Centavos returned to the customer. */
  amount: number;
  /** Units refunded across all lines. */
  itemCount: number;
  /** True when this id was already applied and the earlier result is returned. */
  replayed: boolean;
};

/** Thrown inside the transaction to roll it back and return this result instead. */
class Refusal extends Error {
  constructor(readonly result: Result<never>) {
    super(result.ok ? "" : result.error.message);
  }
}

async function findRefund(tx: Tx, id: string): Promise<Omit<RefundResult, "replayed"> | null> {
  const refund = await tx.refund.findUnique({
    where: { id },
    select: { id: true, saleId: true, amount: true, items: { select: { quantity: true } } },
  });
  if (!refund) return null;
  return {
    id: refund.id,
    saleId: refund.saleId,
    amount: refund.amount,
    itemCount: refund.items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export async function refundSale(input: RefundSaleInput): Promise<Result<RefundResult>> {
  const auth = await requireCapability("refunds.create");
  if (!auth.ok) return auth;
  const parsed = refundSaleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, occurredAt, saleId, items, note } = parsed.data;
  let productIds: string[] = [];

  try {
    const outcome = await runIdempotent({
      id,
      findExisting: findRefund,
      apply: async (tx) => {
        // Lock the sale so two refunds of it at once can't together pass FR-040.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          select id from "Sale" where id = ${saleId}::uuid for update`;
        if (locked.length === 0) throw new Refusal(fail("NOT_FOUND", "This sale doesn't exist."));
        const sale = await tx.sale.findUniqueOrThrow({
          where: { id: saleId },
          select: {
            subtotal: true,
            total: true,
            items: {
              select: {
                id: true,
                productId: true,
                productName: true,
                quantity: true,
                unitPrice: true,
                refundedQuantity: true,
              },
            },
          },
        });
        const byId = new Map(sale.items.map((item) => [item.id, item]));

        // Report every problem at once so the whole form can be fixed in one go.
        const problems: Record<string, string[]> = {};
        const lines: { item: (typeof sale.items)[number]; quantity: number }[] = [];
        for (const { saleItemId, quantity } of items) {
          const item = byId.get(saleItemId);
          if (!item) {
            problems[refundLineKey(saleItemId)] = ["This item isn't part of this sale."];
            continue;
          }
          const left = item.quantity - item.refundedQuantity;
          if (quantity > left) {
            problems[refundLineKey(saleItemId)] = [
              left === 0
                ? `${item.productName} has already been fully refunded.`
                : `Only ${left} of ${item.productName} can still be refunded.`,
            ];
          }
          lines.push({ item, quantity });
        }
        if (Object.keys(problems).length > 0) {
          throw new Refusal(fail("CONFLICT", "You can't refund more than was sold.", problems));
        }

        const amounts = refundAmounts(
          sale,
          sale.items.map((item) => ({
            unitPrice: item.unitPrice,
            quantity: item.refundedQuantity,
          })),
          lines.map(({ item, quantity }) => ({ unitPrice: item.unitPrice, quantity })),
        );
        const amount = amounts.reduce((sum, value) => sum + value, 0);

        await tx.refund.create({
          data: {
            id,
            saleId,
            occurredAt,
            userId: auth.data.id,
            amount,
            note,
            items: {
              create: lines.map(({ item, quantity }, index) => ({
                saleItemId: item.id,
                quantity,
                amount: amounts[index],
              })),
            },
          },
        });

        // Products still in the catalogue get their units back, locked in a fixed order.
        // A line whose product was deleted is refunded in money only: there's no stock to restore.
        const restocked = lines
          .filter((line): line is typeof line & { item: { productId: string } } =>
            Boolean(line.item.productId),
          )
          .sort((a, b) => a.item.productId.localeCompare(b.item.productId));
        productIds = restocked.map((line) => line.item.productId);
        if (productIds.length > 0) {
          await tx.$queryRaw`
            select 1 from "Product" where id in (${Prisma.join(productIds)}) order by id for update`;
        }

        for (const { item, quantity } of lines) {
          await tx.saleItem.update({
            where: { id: item.id },
            data: { refundedQuantity: { increment: quantity } },
          });
        }
        for (const { item, quantity } of restocked) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: quantity } },
          });
          await recordInventoryChange(tx, {
            productId: item.productId,
            type: "REFUND",
            quantityChange: quantity,
            userId: auth.data.id,
            occurredAt,
            saleId,
            refundId: id,
            note: note ?? undefined,
          });
        }

        return {
          id,
          saleId,
          amount,
          itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        };
      },
    });
    revalidatePath("/sales");
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/products");
    for (const productId of productIds) revalidatePath(`/products/${productId}`);
    revalidatePath("/checkout");
    revalidatePath("/inventory-history");
    revalidatePath("/dashboard");
    return ok({ ...outcome.result, replayed: outcome.replayed });
  } catch (err) {
    if (err instanceof Refusal) return err.result;
    console.error("refund failed", err);
    return fail("CONFLICT", "The refund couldn't be saved. Please try again.");
  }
}
