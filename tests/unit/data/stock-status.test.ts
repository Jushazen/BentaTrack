import { describe, expect, test } from "vitest";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  STOCK_STATUS_LABEL,
  crossedIntoAlert,
  stockStatus,
} from "@/lib/stock-status";

describe("stock status", () => {
  test("[FR-006] a product at zero stock is Out of Stock", () => {
    expect(stockStatus(0, 5)).toBe("OUT_OF_STOCK");
    expect(STOCK_STATUS_LABEL.OUT_OF_STOCK).toBe("Out of Stock");
  });

  test("[FR-009] low stock is a separate status from out of stock", () => {
    expect(stockStatus(1, 5)).toBe("LOW_STOCK");
    expect(stockStatus(5, 5)).toBe("LOW_STOCK");
    expect(stockStatus(6, 5)).toBe("ACTIVE");
    expect(stockStatus(1, 5)).not.toBe(stockStatus(0, 5));
    expect(STOCK_STATUS_LABEL.LOW_STOCK).toBe("Low Stock");
  });

  test("[FR-037] threshold defaults to 5 and is respected per product", () => {
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(5);
    expect(stockStatus(10, 10)).toBe("LOW_STOCK");
    expect(stockStatus(1, 0)).toBe("ACTIVE");
  });

  test("[FR-009] alerts fire only when status gets worse", () => {
    expect(crossedIntoAlert(8, 5, 5)).toBe(true); // Active → Low
    expect(crossedIntoAlert(3, 0, 5)).toBe(true); // Low → Out
    expect(crossedIntoAlert(4, 3, 5)).toBe(false); // Low → Low
    expect(crossedIntoAlert(3, 9, 5)).toBe(false); // restock
  });
});
