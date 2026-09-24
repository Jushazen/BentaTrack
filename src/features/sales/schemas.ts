// Zod input schemas: Checkout (FR-013–019; amendments A1, A4, B8, B9). Leaf 4.1.
// Recording a sale is an offline-capable command (FR-049): its payload is plain JSON with a
// client-generated UUID and the time it happened, so a replay from the outbox is idempotent.
import { z } from "zod";

export const MAX_SALE_LINES = 50;
export const MAX_LINE_QUANTITY = 1_000;
export const MAX_CUSTOMER_INFO = 200;
/** 100% in basis points. */
export const MAX_PERCENT_BASIS_POINTS = 10_000;
/** Sale amounts are stored in 32-bit integer columns; stay well below their limit. */
export const MAX_SALE_TOTAL = 2_000_000_000;
/** Allowance for a device clock that runs a little fast. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const PAYMENT_METHODS = ["CASH", "GCASH"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", GCASH: "GCash" };

const saleLineSchema = z.object({
  productId: z.string({ error: "Choose a product." }).trim().min(1, "Choose a product."),
  quantity: z
    .number({ error: "Enter a quantity." })
    .int("Enter a whole number.")
    .min(1, "Sell at least 1.")
    .max(MAX_LINE_QUANTITY, `Sell up to ${MAX_LINE_QUANTITY.toLocaleString("en-PH")} at a time.`),
  /** Centavos: the price the cashier saw. The sale is refused if the product's price changed. */
  unitPrice: z.number({ error: "This item is missing its price." }).int().min(0),
});

const discountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("AMOUNT"),
    /** Centavos. */
    value: z
      .number({ error: "Enter the discount." })
      .int()
      .min(0, "The discount can't be negative."),
  }),
  z.object({
    type: z.literal("PERCENT"),
    /** Basis points: 12.5% = 1250. */
    value: z
      .number({ error: "Enter the discount." })
      .int()
      .min(0, "The discount can't be negative.")
      .max(MAX_PERCENT_BASIS_POINTS, "A discount can't be more than 100%."),
  }),
]);

export const recordSaleSchema = z.object({
  id: z.uuid({ error: "This sale is missing its id. Reload the page and try again." }),
  occurredAt: z.iso
    .datetime({ offset: true, error: "This sale is missing its time." })
    .transform((value) => new Date(value))
    .refine((date) => date.getTime() <= Date.now() + CLOCK_SKEW_MS, {
      error: "This sale's time is in the future. Check the device clock.",
    }),
  items: z
    .array(saleLineSchema, { error: "Add at least one item." })
    .min(1, "Add at least one item.")
    .max(MAX_SALE_LINES, `A sale can have up to ${MAX_SALE_LINES} different items.`)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, {
      error: "Each product can appear only once in a sale.",
    }),
  discount: discountSchema
    .nullish()
    // A zero discount is no discount.
    .transform((discount) => (discount && discount.value > 0 ? discount : null)),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Choose Cash or GCash." }),
  customerInfo: z
    .string()
    .trim()
    .max(MAX_CUSTOMER_INFO, `Keep customer details under ${MAX_CUSTOMER_INFO} characters.`)
    .nullish()
    .transform((value) => value || null),
});

export type RecordSaleInput = z.input<typeof recordSaleSchema>;
