// Sales report arithmetic (FR-021, FR-022, FR-047). Pure, so it can be tested without a database.
//
// Sales count in the period they happened; refunds are subtracted in the period they were given,
// not the period of the original sale (amendment B7/C7). A whole-sale discount is spread over the
// sale's lines in proportion to price (the same split refunds use), so per-product revenue and
// profit add up to what the customer actually paid.
import type { PaymentMethod } from "@/generated/prisma/enums";
import { refundAmounts } from "@/features/refunds/refund-math";
import type { Bucket } from "@/lib/dates";

export const BEST_SELLER_LIMIT = 10;

type ProductRef = {
  productId: string | null;
  productName: string;
  productCode: string;
  /** Centavos; null when the product had no purchase price at the time of sale. */
  unitCost: number | null;
};

export type ReportSale = {
  occurredAt: Date;
  subtotal: number;
  total: number;
  paymentMethod: PaymentMethod;
  items: (ProductRef & { quantity: number; unitPrice: number })[];
};

export type ReportRefund = {
  occurredAt: Date;
  amount: number;
  /** The original sale's payment method: the money goes back the same way. */
  paymentMethod: PaymentMethod;
  items: { quantity: number; amount: number; saleItem: ProductRef }[];
};

export type BestSeller = {
  productId: string | null;
  name: string;
  code: string;
  /** Units sold in the period less units refunded in it. */
  units: number;
  /** Centavos paid for them, after discounts and refunds. */
  revenue: number;
};

export type GrossProfit = {
  /** Centavos: revenue less purchase cost, for lines whose cost is known. */
  amount: number;
  /** Units sold in the period that are left out because their product had no cost (FR-047). */
  excludedUnits: number;
};

export type SalesReportTotals = {
  /** Centavos paid for sales in the period (after discounts). */
  grossSales: number;
  /** Centavos returned by refunds given in the period. */
  refunds: number;
  netSales: number;
  /** Centavos taken off by discounts on sales in the period. */
  discounts: number;
  saleCount: number;
  refundCount: number;
  itemsSold: number;
  itemsRefunded: number;
};

export type SalesReportFigures = {
  totals: SalesReportTotals;
  byPayment: { method: PaymentMethod; sales: number; refunds: number; net: number }[];
  /** Net sales per chart bucket. */
  buckets: { label: string; netSales: number }[];
  bestSellers: BestSeller[];
  /** Null unless the viewer may see costs. */
  profit: GrossProfit | null;
};

const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "GCASH"];

function productKey(ref: ProductRef): string {
  // A deleted product keeps its code snapshot, so its history still groups together.
  return ref.productId ?? `code:${ref.productCode}`;
}

function bucketOf(buckets: readonly Bucket[], instant: Date): number {
  return buckets.findIndex((bucket) => instant >= bucket.start && instant < bucket.end);
}

export function buildSalesReport(input: {
  sales: readonly ReportSale[];
  refunds: readonly ReportRefund[];
  buckets: readonly Bucket[];
  includeProfit: boolean;
}): SalesReportFigures {
  const { sales, refunds, buckets } = input;
  const totals: SalesReportTotals = {
    grossSales: 0,
    refunds: 0,
    netSales: 0,
    discounts: 0,
    saleCount: sales.length,
    refundCount: refunds.length,
    itemsSold: 0,
    itemsRefunded: 0,
  };
  const payment = new Map(PAYMENT_METHODS.map((method) => [method, { sales: 0, refunds: 0 }]));
  const bucketNet = buckets.map(() => 0);
  const products = new Map<string, BestSeller>();
  const profit: GrossProfit = { amount: 0, excludedUnits: 0 };

  const productEntry = (ref: ProductRef) => {
    const key = productKey(ref);
    let entry = products.get(key);
    if (!entry) {
      entry = {
        productId: ref.productId,
        name: ref.productName,
        code: ref.productCode,
        units: 0,
        revenue: 0,
      };
      products.set(key, entry);
    }
    return entry;
  };

  for (const sale of sales) {
    totals.grossSales += sale.total;
    totals.discounts += sale.subtotal - sale.total;
    payment.get(sale.paymentMethod)!.sales += sale.total;
    const index = bucketOf(buckets, sale.occurredAt);
    if (index >= 0) bucketNet[index] += sale.total;

    const shares = refundAmounts(sale, [], sale.items);
    sale.items.forEach((item, i) => {
      totals.itemsSold += item.quantity;
      const entry = productEntry(item);
      entry.units += item.quantity;
      entry.revenue += shares[i];
      if (item.unitCost === null) profit.excludedUnits += item.quantity;
      else profit.amount += shares[i] - item.unitCost * item.quantity;
    });
  }

  for (const refund of refunds) {
    totals.refunds += refund.amount;
    payment.get(refund.paymentMethod)!.refunds += refund.amount;
    const index = bucketOf(buckets, refund.occurredAt);
    if (index >= 0) bucketNet[index] -= refund.amount;

    for (const item of refund.items) {
      totals.itemsRefunded += item.quantity;
      const entry = productEntry(item.saleItem);
      entry.units -= item.quantity;
      entry.revenue -= item.amount;
      if (item.saleItem.unitCost !== null) {
        profit.amount -= item.amount - item.saleItem.unitCost * item.quantity;
      }
    }
  }

  totals.netSales = totals.grossSales - totals.refunds;

  const bestSellers = [...products.values()]
    .filter((entry) => entry.units > 0)
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name))
    .slice(0, BEST_SELLER_LIMIT);

  return {
    totals,
    byPayment: PAYMENT_METHODS.map((method) => {
      const { sales: paid, refunds: returned } = payment.get(method)!;
      return { method, sales: paid, refunds: returned, net: paid - returned };
    }),
    buckets: buckets.map((bucket, i) => ({ label: bucket.label, netSales: bucketNet[i] })),
    bestSellers,
    profit: input.includeProfit ? profit : null,
  };
}
