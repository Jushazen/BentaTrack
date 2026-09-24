"use server";

// Server actions (mutations): Checkout (FR-005, FR-008, FR-012–019; amendments A1, A4, B8, B9).
// Leaf 4.1. recordSale is idempotent by its client-generated id (FR-036): the Sale row uses that
// id, so replaying the same sale returns the first result without taking stock twice.
import { revalidatePath } from "next/cache";
import type { LowStockAlert } from "@/components/layout/low-stock-alerts";
import { Prisma } from "@/generated/prisma/client";
import { requireCapability } from "@/lib/auth";
import { runIdempotent } from "@/lib/commands";
import type { Tx } from "@/lib/db";
import { recordInventoryChange } from "@/lib/inventory-log";
import { formatPeso } from "@/lib/money";
import { fail, invalid, ok, type Result } from "@/lib/result";
import { crossedIntoAlert } from "@/lib/stock-status";
import { lineKey, saleTotals } from "./cart";
import {
  MAX_SALE_TOTAL,
  recordSaleSchema,
  type PaymentMethod,
  type RecordSaleInput,
} from "./schemas";

export type SaleResult = {
  /** The Sale id, which is also the command id. */
  id: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  /** Units sold across all lines. */
  itemCount: number;
  /** Products this sale moved into Low Stock or Out of Stock (FR-008). Empty on a replay. */
  lowStockAlerts: LowStockAlert[];
  /** True when this id was already applied and the earlier result is returned. */
  replayed: boolean;
};

/** Thrown inside the transaction to roll it back and return this result instead. */
class Refusal extends Error {
  constructor(readonly result: Result<never>) {
    super(result.ok ? "" : result.error.message);
  }
}

async function findSale(tx: Tx, id: string): Promise<Omit<SaleResult, "replayed"> | null> {
  const sale = await tx.sale.findUnique({
    where: { id },
    select: {
      id: true,
      subtotal: true,
      discountAmount: true,
      total: true,
      paymentMethod: true,
      items: { select: { quantity: true } },
    },
  });
  if (!sale) return null;
  return {
    id: sale.id,
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
    lowStockAlerts: [],
  };
}

export async function recordSale(input: RecordSaleInput): Promise<Result<SaleResult>> {
  const auth = await requireCapability("sales.create");
  if (!auth.ok) return auth;
  const parsed = recordSaleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { id, occurredAt, items, discount, paymentMethod, customerInfo } = parsed.data;
  const productIds = items.map((item) => item.productId);

  try {
    const outcome = await runIdempotent({
      id,
      findExisting: findSale,
      apply: async (tx) => {
        // Lock every product in a fixed order so two checkouts can't deadlock or oversell.
        await tx.$queryRaw`
          select 1 from "Product" where id in (${Prisma.join(productIds)}) order by id for update`;
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            code: true,
            sellingPrice: true,
            purchasePrice: true,
            stockQuantity: true,
            lowStockThreshold: true,
          },
        });
        const byId = new Map(products.map((product) => [product.id, product]));

        // Report every problem at once so the cashier can fix the whole cart in one go.
        const missing: Record<string, string[]> = {};
        const repriced: Record<string, string[]> = {};
        const short: Record<string, string[]> = {};
        const lines: { product: (typeof products)[number]; quantity: number }[] = [];
        for (const item of items) {
          const product = byId.get(item.productId);
          if (!product) {
            missing[lineKey(item.productId)] = ["This product no longer exists. Remove it."];
            continue;
          }
          lines.push({ product, quantity: item.quantity });
          if (product.sellingPrice !== item.unitPrice) {
            repriced[lineKey(item.productId)] = [
              `The price is now ${formatPeso(product.sellingPrice)}. Remove it and add it again.`,
            ];
          } else if (product.stockQuantity < item.quantity) {
            short[lineKey(item.productId)] = [
              product.stockQuantity === 0
                ? `${product.name} is out of stock.`
                : `Only ${product.stockQuantity} of ${product.name} in stock.`,
            ];
          }
        }
        if (Object.keys(missing).length > 0) {
          throw new Refusal(
            fail("NOT_FOUND", "A product in the cart no longer exists.", {
              ...missing,
              ...repriced,
              ...short,
            }),
          );
        }
        if (Object.keys(repriced).length > 0) {
          throw new Refusal(
            fail("CONFLICT", "Prices changed. Please review the cart.", { ...repriced, ...short }),
          );
        }
        if (Object.keys(short).length > 0) {
          throw new Refusal(fail("CONFLICT", "Not enough stock for this sale.", short));
        }

        const totals = saleTotals(
          lines.map(({ product, quantity }) => ({ unitPrice: product.sellingPrice, quantity })),
          discount,
        );
        if (totals.subtotal > MAX_SALE_TOTAL) {
          throw new Refusal(fail("VALIDATION", "This sale is too large to record as one sale."));
        }

        await tx.sale.create({
          data: {
            id,
            occurredAt,
            staffId: auth.data.id,
            customerInfo,
            subtotal: totals.subtotal,
            discountType: discount?.type ?? null,
            discountValue: discount?.value ?? null,
            discountAmount: totals.discountAmount,
            total: totals.total,
            paymentMethod,
            items: {
              create: lines.map(({ product, quantity }) => ({
                productId: product.id,
                productName: product.name,
                productCode: product.code,
                quantity,
                unitPrice: product.sellingPrice,
                unitCost: product.purchasePrice,
              })),
            },
          },
        });

        const lowStockAlerts: LowStockAlert[] = [];
        for (const { product, quantity } of lines) {
          await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: quantity } },
          });
          const change = await recordInventoryChange(tx, {
            productId: product.id,
            type: "SALE",
            quantityChange: -quantity,
            userId: auth.data.id,
            occurredAt,
            saleId: id,
          });
          if (
            crossedIntoAlert(product.stockQuantity, change.stockAfter, product.lowStockThreshold)
          ) {
            lowStockAlerts.push({
              productId: product.id,
              name: product.name,
              quantity: change.stockAfter,
              threshold: product.lowStockThreshold,
            });
          }
        }

        return {
          id,
          ...totals,
          paymentMethod,
          itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
          lowStockAlerts,
        };
      },
    });
    revalidatePath("/checkout");
    revalidatePath("/products");
    for (const productId of productIds) revalidatePath(`/products/${productId}`);
    revalidatePath("/inventory-history");
    revalidatePath("/sales");
    revalidatePath("/dashboard");
    return ok({ ...outcome.result, replayed: outcome.replayed });
  } catch (err) {
    if (err instanceof Refusal) return err.result;
    console.error("sale failed", err);
    return fail("CONFLICT", "The sale couldn't be saved. Please try again.");
  }
}
