// Product list filters, read from the URL (FR-006, FR-009, FR-057). Moved out of ./schemas.ts in
// leaf 9.2 so the offline product list in the browser parses them exactly as the server does.
import { z } from "zod";

// Kept small so the list page loads in under a second on a phone over 4G (NFR-PERF-1).
export const PRODUCT_PAGE_SIZE = 25;

/** Filters on the product list page (read from the URL). */
export const productFiltersSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  category: z.string().trim().min(1).optional().catch(undefined),
  /** low = Low Stock or Out of Stock; out = Out of Stock only. */
  stock: z.enum(["low", "out"]).optional().catch(undefined),
  /** Owner only: products with no purchase price yet (A7 follow-on). */
  cost: z.literal("missing").optional().catch(undefined),
  /** Owner only: archived products instead of the ones in use (FR-057). */
  archived: z.literal("1").optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type ProductFilters = z.output<typeof productFiltersSchema>;
