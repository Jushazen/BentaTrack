// Zod input schemas: Restock and inventory history (FR-010–012, FR-038). Leaf 3.4.
// Restock is an offline-capable command (FR-049): its payload is plain JSON with a
// client-generated UUID and the time it happened, so a replay from the outbox is idempotent.
import { z } from "zod";

export const MAX_RESTOCK_QUANTITY = 10_000;
/** Same ceiling the product form allows for a stock count (products/schemas.ts). */
export const MAX_STOCK = 1_000_000;
/** Allowance for a device clock that runs a little fast. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const restockSchema = z.object({
  id: z.uuid({ error: "This restock is missing its id. Reload the page and try again." }),
  occurredAt: z.iso
    .datetime({ offset: true, error: "This restock is missing its time." })
    .transform((value) => new Date(value))
    .refine((date) => date.getTime() <= Date.now() + CLOCK_SKEW_MS, {
      error: "This restock's time is in the future. Check the device clock.",
    }),
  productId: z.string({ error: "Choose a product." }).trim().min(1, "Choose a product."),
  quantity: z
    .number({ error: "Enter how many units you received." })
    .int("Enter a whole number of units.")
    .min(1, "Enter at least 1 unit.")
    .max(
      MAX_RESTOCK_QUANTITY,
      `Enter up to ${MAX_RESTOCK_QUANTITY.toLocaleString("en-PH")} units at a time.`,
    ),
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters.")
    .optional()
    .transform((value) => value || undefined),
});

export type RestockInput = z.input<typeof restockSchema>;

export const INVENTORY_CHANGE_TYPES = ["SALE", "RESTOCK", "EDIT", "REFUND", "REMOVAL"] as const;

/** History filters from the page URL. Anything malformed is dropped rather than rejected. */
export const historyFiltersSchema = z.object({
  product: z.string().trim().min(1).max(100).optional().catch(undefined),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined)
    .catch(undefined),
  type: z.enum(INVENTORY_CHANGE_TYPES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type HistoryFilters = z.output<typeof historyFiltersSchema>;
