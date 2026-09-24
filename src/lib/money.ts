// Money is integer centavos everywhere (₱150.50 = 15050). Never use floats for amounts.

const pesoFormat = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123450 → "₱1,234.50"; negative amounts → "-₱1,234.50". */
export function formatPeso(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) throw new RangeError("centavos must be a safe integer");
  const sign = centavos < 0 ? "-" : "";
  return `${sign}₱${pesoFormat.format(Math.abs(centavos) / 100)}`;
}

/**
 * Parses what a person types ("1,234.5", "₱ 99", "0.05") into centavos.
 * Returns null for anything that isn't a non-negative amount with at most 2 decimals.
 */
export function parsePeso(input: string): number | null {
  const cleaned = input.trim().replace(/^₱\s*/, "").replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const centavos = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

export type Discount = { type: "AMOUNT"; value: number } | { type: "PERCENT"; value: number };

/**
 * Centavos taken off a subtotal. AMOUNT value is centavos; PERCENT value is basis points
 * (12.5% = 1250). Rounds half up to the centavo and never exceeds the subtotal (FR-017).
 */
export function discountAmount(subtotal: number, discount: Discount | null | undefined): number {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
    throw new RangeError("subtotal must be a non-negative integer");
  }
  if (!discount) return 0;
  if (!Number.isSafeInteger(discount.value) || discount.value < 0) {
    throw new RangeError("discount value must be a non-negative integer");
  }
  const raw =
    discount.type === "AMOUNT"
      ? discount.value
      : Math.floor((subtotal * Math.min(discount.value, 10_000) + 5_000) / 10_000);
  return Math.min(raw, subtotal);
}
