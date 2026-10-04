// Zod input schemas: Sales history and refunds (FR-012, FR-039, FR-040; amendments C7, H4). Leaves 4.2, 8.4.
// Refunding is an offline-capable command (FR-049): its payload is plain JSON with a
// client-generated UUID and the time it happened, so a replay from the outbox is idempotent.
import { z } from "zod";

export const MAX_REFUND_NOTE = 500;
/** Same ceiling as a sale's line count (sales/schemas.ts MAX_SALE_LINES). */
export const MAX_REFUND_LINES = 50;
/** Allowance for a device clock that runs a little fast. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const lineId = z.string({ error: "Choose an item." }).trim().min(1, "Choose an item.");

/**
 * A line names its sale line by `saleItemId`, or by `productId` (FR-049): a sale recorded offline
 * has no line ids until the server stores it, and a product appears only once in a sale, so a
 * refund queued before its sale syncs names the product instead.
 */
const refundLineSchema = z
  .object({
    saleItemId: lineId.optional(),
    productId: lineId.optional(),
    quantity: z
      .number({ error: "Enter how many to refund." })
      .int("Enter a whole number.")
      .min(1, "Refund at least 1."),
    /** H4.2: false when the units don't go back in stock, e.g. because they're damaged. */
    returnToStock: z.boolean().default(true),
  })
  .refine((line) => (line.saleItemId === undefined) !== (line.productId === undefined), {
    error: "Choose an item.",
  });

export type RefundLineRef = { saleItemId?: string; productId?: string };

export const refundSaleSchema = z.object({
  id: z.uuid({ error: "This refund is missing its id. Reload the page and try again." }),
  occurredAt: z.iso
    .datetime({ offset: true, error: "This refund is missing its time." })
    .transform((value) => new Date(value))
    .refine((date) => date.getTime() <= Date.now() + CLOCK_SKEW_MS, {
      error: "This refund's time is in the future. Check the device clock.",
    }),
  saleId: z.uuid({ error: "This refund is missing its sale." }),
  items: z
    .array(refundLineSchema, { error: "Choose at least one item to refund." })
    .min(1, "Choose at least one item to refund.")
    .max(MAX_REFUND_LINES, `A refund can have up to ${MAX_REFUND_LINES} different items.`)
    .refine((items) => new Set(items.map(refundLineKey)).size === items.length, {
      error: "Each item can appear only once in a refund.",
    }),
  // H4.4: the owner sees why every refund was given.
  note: z
    .string({ error: "Enter the reason for this refund." })
    .trim()
    .min(1, "Enter the reason for this refund.")
    .max(MAX_REFUND_NOTE, `Keep the reason under ${MAX_REFUND_NOTE} characters.`),
});

export type RefundSaleInput = z.input<typeof refundSaleSchema>;

export const SALES_PAGE_SIZE = 50;

/** Sales list filters from the page URL. Anything malformed is dropped rather than rejected. */
export const salesFiltersSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined)
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type SalesFilters = z.output<typeof salesFiltersSchema>;

/** Field-error key for one refund line, shared by the action and the refund form. */
export function refundLineKey(line: RefundLineRef): string {
  return line.saleItemId !== undefined
    ? `item-${line.saleItemId}`
    : `item-product-${line.productId}`;
}
