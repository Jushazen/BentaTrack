import { describe, expect, test } from "vitest";
import { discountAmount, formatPeso, parsePeso } from "@/lib/money";

describe("money", () => {
  test("[MONEY-1] formats centavos as pesos with thousands separators", () => {
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(5)).toBe("₱0.05");
    expect(formatPeso(15050)).toBe("₱150.50");
    expect(formatPeso(123_456_789)).toBe("₱1,234,567.89");
    expect(formatPeso(-2500)).toBe("-₱25.00");
    expect(() => formatPeso(1.5)).toThrow();
  });

  test("[MONEY-1] parses typed amounts into centavos and rejects bad input", () => {
    expect(parsePeso("150.5")).toBe(15050);
    expect(parsePeso("₱ 1,234.50")).toBe(123450);
    expect(parsePeso("99")).toBe(9900);
    expect(parsePeso("0.05")).toBe(5);
    expect(parsePeso(" 12.30 ")).toBe(1230);
    for (const bad of ["", "abc", "-5", "1.234", "1..2", "1e3", ".5"]) {
      expect(parsePeso(bad), bad).toBeNull();
    }
  });

  test("[MONEY-1] discount by amount is capped at the subtotal", () => {
    expect(discountAmount(10000, null)).toBe(0);
    expect(discountAmount(10000, { type: "AMOUNT", value: 2500 })).toBe(2500);
    expect(discountAmount(10000, { type: "AMOUNT", value: 50000 })).toBe(10000);
  });

  test("[MONEY-1] percent discount rounds half up to the centavo and caps at 100%", () => {
    // 12.5% of ₱99.99 = 1249.875 centavos → 1250
    expect(discountAmount(9999, { type: "PERCENT", value: 1250 })).toBe(1250);
    // 10% of ₱0.05 = 0.5 centavo → rounds up to 1
    expect(discountAmount(5, { type: "PERCENT", value: 1000 })).toBe(1);
    // 10% of ₱0.04 = 0.4 centavo → 0
    expect(discountAmount(4, { type: "PERCENT", value: 1000 })).toBe(0);
    expect(discountAmount(10000, { type: "PERCENT", value: 25_000 })).toBe(10000);
    expect(() => discountAmount(10000, { type: "PERCENT", value: -1 })).toThrow();
    expect(() => discountAmount(-1, null)).toThrow();
  });
});
