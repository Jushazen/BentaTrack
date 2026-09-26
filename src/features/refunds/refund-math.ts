// Money returned for a refund (FR-039). Pure, so the refund form can preview the same amount the
// server records.
//
// The customer gets back their share of what they actually paid: a whole-sale discount is spread
// over the items in proportion to their price. Amounts are worked out cumulatively over the sale
// ("paid for everything refunded so far" minus "paid for everything refunded before"), so the
// refunds of a sale always add up to exactly its total, with no rounding drift.

export type RefundSale = {
  /** Centavos, before discount. */
  subtotal: number;
  /** Centavos actually paid. */
  total: number;
};

export type RefundLine = {
  /** Centavos. */
  unitPrice: number;
  quantity: number;
};

/** Share of `total` paid for `gross` centavos of goods, rounded half up to the centavo. */
function paidFor(sale: RefundSale, gross: number): number {
  if (sale.subtotal <= 0) return 0;
  // BigInt: gross × total can exceed Number.MAX_SAFE_INTEGER for large sales.
  const two = BigInt(2);
  const numerator = two * BigInt(gross) * BigInt(sale.total) + BigInt(sale.subtotal);
  return Number(numerator / (two * BigInt(sale.subtotal)));
}

function gross(lines: readonly RefundLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

/**
 * Centavos to return for each of `lines`, in order, given the lines already refunded earlier.
 * The sum of the result is the refund amount. Refunding every unit of a sale, over one refund or
 * many, returns exactly `sale.total`.
 */
export function refundAmounts(
  sale: RefundSale,
  alreadyRefunded: readonly RefundLine[],
  lines: readonly RefundLine[],
): number[] {
  let before = gross(alreadyRefunded);
  return lines.map((line) => {
    const after = before + line.unitPrice * line.quantity;
    const amount = paidFor(sale, after) - paidFor(sale, before);
    before = after;
    return amount;
  });
}
