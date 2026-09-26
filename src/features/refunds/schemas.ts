// Zod input schemas: Sales history and refunds (FR-012, FR-039, FR-040; amendment C7). Leaf 4.2.
// Refunding is an offline-capable command (FR-049): its payload is plain JSON with a
// client-generated UUID and the time it happened, so a replay from the outbox is idempotent.
import { z } from "zod";

export const MAX_REFUND_NOTE = 500;
/** Same ceiling as a sale's line count (sales/schemas.ts MAX_SALE_LINES). */
export const MAX_REFUND_LINES = 50;
/** Allowance for a device clock that runs a little fast. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const refundLineSchema = z.object({
  saleItemId: z.string({ error: "Choose an item." }).trim().min(1, "Choose an item."),
  quantity: z
    .number({ error: "Enter how many to refund." })
    .int("Enter a whole number.")
    .min(1, "Refund at least 1."),
});

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
    .refine((items) => new Set(items.map((item) => item.saleItemId)).size === items.length, {
      error: "Each item can appear only once in a refund.",
    }),
  note: z
    .string()
    .trim()
    .max(MAX_REFUND_NOTE, `Keep the reason under ${MAX_REFUND_NOTE} characters.`)
    .nullish()
    .transform((value) => value || null),
});

export type RefundSaleInput = z.input<typeof refundSaleSchema>;

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

/** Field-error key for one sale line, shared by the action and the refund form. */
export function refundLineKey(saleItemId: string): string {
  return `item-${saleItemId}`;
}
