import { expect, test } from "vitest";
import {
  addToCart,
  parseDiscount,
  quantityProblem,
  removeLine,
  saleTotals,
  setQuantity,
  type CartProduct,
} from "@/features/sales/cart";

const tote: CartProduct = {
  productId: "p1",
  name: "Canvas Tote",
  code: "TOTE-1",
  unitPrice: 25_000,
  stockQuantity: 2,
};
const fan: CartProduct = {
  productId: "p2",
  name: "Pandan Fan",
  code: "FAN-1",
  unitPrice: 9_950,
  stockQuantity: 10,
};

test("[FR-013] adding a product twice raises its quantity instead of adding a second line", () => {
  const once = addToCart([], tote);
  expect(once.ok).toBe(true);
  const twice = addToCart(once.lines, tote);
  expect(twice.ok).toBe(true);
  expect(twice.lines).toHaveLength(1);
  expect(twice.lines[0]?.quantity).toBe(2);

  const withFan = addToCart(twice.lines, fan);
  expect(withFan.lines.map((line) => [line.productId, line.quantity])).toEqual([
    ["p1", 2],
    ["p2", 1],
  ]);
});

test("[FR-013] the cart never holds more than the stock or an out-of-stock product", () => {
  const full = addToCart(addToCart([], tote).lines, tote).lines;
  const third = addToCart(full, tote);
  expect(third.ok).toBe(false);
  if (!third.ok) expect(third.message).toBe("Only 2 of Canvas Tote in stock.");
  expect(third.lines[0]?.quantity).toBe(2);

  const empty = addToCart([], { ...fan, stockQuantity: 0 });
  expect(empty.ok).toBe(false);
  if (!empty.ok) expect(empty.message).toBe("Pandan Fan is out of stock.");
  expect(empty.lines).toEqual([]);
});

test("[FR-013] quantities can be changed and lines removed; bad quantities are flagged", () => {
  const lines = addToCart(addToCart([], tote).lines, fan).lines;
  const changed = setQuantity(lines, "p2", 4);
  expect(changed.find((line) => line.productId === "p2")?.quantity).toBe(4);
  expect(removeLine(changed, "p1").map((line) => line.productId)).toEqual(["p2"]);

  const line = changed[0];
  if (!line) throw new Error("missing line");
  expect(quantityProblem({ ...line, quantity: 1 })).toBeNull();
  expect(quantityProblem({ ...line, quantity: 0 })).toBe("Enter at least 1.");
  expect(quantityProblem({ ...line, quantity: Number.NaN })).toBe("Enter at least 1.");
  expect(quantityProblem({ ...line, quantity: 3 })).toBe("Only 2 in stock.");
});

test("[FR-014] totals: subtotal is the sum of price × quantity; total is subtotal minus discount", () => {
  const lines = [
    { unitPrice: 25_000, quantity: 2 },
    { unitPrice: 9_950, quantity: 3 },
  ];
  expect(saleTotals(lines, null)).toEqual({ subtotal: 79_850, discountAmount: 0, total: 79_850 });
  expect(saleTotals(lines, { type: "AMOUNT", value: 5_000 })).toEqual({
    subtotal: 79_850,
    discountAmount: 5_000,
    total: 74_850,
  });
  // 10% of ₱798.50 = ₱79.85
  expect(saleTotals(lines, { type: "PERCENT", value: 1_000 })).toEqual({
    subtotal: 79_850,
    discountAmount: 7_985,
    total: 71_865,
  });
});

test("[FR-017-CAP] a discount never takes the total below zero", () => {
  const lines = [{ unitPrice: 10_000, quantity: 1 }];
  expect(saleTotals(lines, { type: "AMOUNT", value: 50_000 })).toEqual({
    subtotal: 10_000,
    discountAmount: 10_000,
    total: 0,
  });
  expect(saleTotals(lines, { type: "PERCENT", value: 10_000 }).total).toBe(0);
});

test("[FR-017] discount input: pesos or percent, refused when larger than the subtotal", () => {
  expect(parseDiscount("NONE", "50", 10_000)).toEqual({ ok: true, discount: null });
  expect(parseDiscount("AMOUNT", "", 10_000)).toEqual({ ok: true, discount: null });
  expect(parseDiscount("AMOUNT", "12.50", 10_000)).toEqual({
    ok: true,
    discount: { type: "AMOUNT", value: 1_250 },
  });
  expect(parseDiscount("AMOUNT", "0", 10_000)).toEqual({ ok: true, discount: null });
  expect(parseDiscount("AMOUNT", "100.01", 10_000)).toEqual({
    ok: false,
    message: "The discount can't be more than the subtotal.",
  });
  expect(parseDiscount("AMOUNT", "abc", 10_000).ok).toBe(false);

  expect(parseDiscount("PERCENT", "12.5", 10_000)).toEqual({
    ok: true,
    discount: { type: "PERCENT", value: 1_250 },
  });
  expect(parseDiscount("PERCENT", "10%", 10_000)).toEqual({
    ok: true,
    discount: { type: "PERCENT", value: 1_000 },
  });
  expect(parseDiscount("PERCENT", "100", 10_000)).toEqual({
    ok: true,
    discount: { type: "PERCENT", value: 10_000 },
  });
  expect(parseDiscount("PERCENT", "100.5", 10_000)).toEqual({
    ok: false,
    message: "A discount can't be more than 100%.",
  });
  expect(parseDiscount("PERCENT", "-5", 10_000).ok).toBe(false);
  expect(parseDiscount("PERCENT", "1.234", 10_000).ok).toBe(false);
});
