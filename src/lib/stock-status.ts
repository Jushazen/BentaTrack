// Product status is computed from stock, never stored (FR-006, FR-009, FR-037).

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export type StockStatus = "ACTIVE" | "LOW_STOCK" | "OUT_OF_STOCK";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  ACTIVE: "Active",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

/** Out of Stock at 0, Low Stock when 0 < quantity ≤ threshold, otherwise Active. */
export function stockStatus(quantity: number, threshold: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= threshold) return "LOW_STOCK";
  return "ACTIVE";
}

/** True when a stock change moves a product into a worse status (for low-stock pop-ups, FR-008). */
export function crossedIntoAlert(before: number, after: number, threshold: number): boolean {
  const rank = { ACTIVE: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 } as const;
  return rank[stockStatus(after, threshold)] > rank[stockStatus(before, threshold)];
}
