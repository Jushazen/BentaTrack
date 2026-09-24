// Checkout cart and sale totals (FR-013, FR-014, FR-017). Pure functions shared by the checkout
// form and the recordSale action, so the total the cashier sees is the total that is saved.
import { discountAmount, parsePeso, type Discount } from "@/lib/money";
import { MAX_LINE_QUANTITY, MAX_PERCENT_BASIS_POINTS } from "./schemas";

export type CartLine = {
  productId: string;
  name: string;
  code: string;
  /** Centavos. */
  unitPrice: number;
  /** Stock when the product was added; the server checks the real stock again. */
  stockQuantity: number;
  quantity: number;
};

export type CartProduct = Omit<CartLine, "quantity">;

/** fieldErrors key the server uses for a problem with one cart line. */
export function lineKey(productId: string): string {
  return `item:${productId}`;
}

export type AddOutcome =
  { ok: true; lines: CartLine[] } | { ok: false; lines: CartLine[]; message: string };

/** Adds one unit of a product, or one more if it's already in the cart. Never exceeds stock. */
export function addToCart(lines: readonly CartLine[], product: CartProduct): AddOutcome {
  if (product.stockQuantity <= 0) {
    return { ok: false, lines: [...lines], message: `${product.name} is out of stock.` };
  }
  const existing = lines.find((line) => line.productId === product.productId);
  if (!existing) return { ok: true, lines: [...lines, { ...product, quantity: 1 }] };
  const limit = Math.min(product.stockQuantity, MAX_LINE_QUANTITY);
  if (existing.quantity >= limit) {
    return {
      ok: false,
      lines: [...lines],
      message: `Only ${product.stockQuantity} of ${product.name} in stock.`,
    };
  }
  return {
    ok: true,
    lines: lines.map((line) =>
      line.productId === product.productId
        ? { ...line, ...product, quantity: line.quantity + 1 }
        : line,
    ),
  };
}

export function setQuantity(
  lines: readonly CartLine[],
  productId: string,
  quantity: number,
): CartLine[] {
  return lines.map((line) => (line.productId === productId ? { ...line, quantity } : line));
}

export function removeLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

/** A message when a quantity can't be sold as entered, else null. */
export function quantityProblem(line: CartLine): string | null {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) return "Enter at least 1.";
  if (line.quantity > MAX_LINE_QUANTITY) {
    return `Sell up to ${MAX_LINE_QUANTITY.toLocaleString("en-PH")} at a time.`;
  }
  if (line.quantity > line.stockQuantity) return `Only ${line.stockQuantity} in stock.`;
  return null;
}

export type SaleTotals = { subtotal: number; discountAmount: number; total: number };

/** Subtotal of the lines, the discount taken off (never more than the subtotal), and the total. */
export function saleTotals(
  lines: readonly { unitPrice: number; quantity: number }[],
  discount: Discount | null,
): SaleTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const off = discountAmount(subtotal, discount);
  return { subtotal, discountAmount: off, total: subtotal - off };
}

export type DiscountMode = "NONE" | "AMOUNT" | "PERCENT";

export type ParsedDiscount =
  { ok: true; discount: Discount | null } | { ok: false; message: string };

/**
 * Reads the discount the cashier typed. Amounts are pesos ("50", "12.50"); percentages allow up
 * to two decimals ("12.5" → 1250 basis points). A discount larger than the subtotal is refused
 * here so the cashier can correct it; the server still caps it (FR-017).
 */
export function parseDiscount(mode: DiscountMode, text: string, subtotal: number): ParsedDiscount {
  const trimmed = text.trim();
  if (mode === "NONE" || trimmed === "") return { ok: true, discount: null };
  if (mode === "AMOUNT") {
    const value = parsePeso(trimmed);
    if (value === null) return { ok: false, message: "Enter an amount like 50 or 12.50." };
    if (value > subtotal) {
      return { ok: false, message: "The discount can't be more than the subtotal." };
    }
    return { ok: true, discount: value > 0 ? { type: "AMOUNT", value } : null };
  }
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?%?$/.exec(trimmed);
  if (!match) return { ok: false, message: "Enter a percentage like 10 or 12.5." };
  const value = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (value > MAX_PERCENT_BASIS_POINTS) {
    return { ok: false, message: "A discount can't be more than 100%." };
  }
  return { ok: true, discount: value > 0 ? { type: "PERCENT", value } : null };
}
