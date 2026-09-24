"use client";

// Checkout (FR-013–019, Figure 1): find products by name, code, scanner, or phone camera; set
// quantities; apply a whole-sale discount; choose Cash or GCash; and record the sale. The command
// id is kept until the sale succeeds, so pressing "Complete sale" again after a dropped
// connection can't record it twice. Any change to the cart starts a new sale id.
import { CheckCircle2, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { showLowStockAlerts } from "@/components/layout/low-stock-alerts";
import { CameraScanButton } from "@/components/scanner/camera-scanner";
import { useBarcodeWedge } from "@/components/scanner/use-barcode-wedge";
import { Button } from "@/components/ui/button";
import { inputClasses, TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { lookupProductAction } from "@/features/search/actions";
import { ProductSearch } from "@/features/search/product-search";
import type { SearchHit } from "@/features/search/queries";
import { formatPeso } from "@/lib/money";
import { recordSale } from "./actions";
import {
  addToCart,
  lineKey,
  parseDiscount,
  quantityProblem,
  removeLine,
  saleTotals,
  setQuantity,
  type CartLine,
  type DiscountMode,
} from "./cart";
import {
  MAX_CUSTOMER_INFO,
  MAX_LINE_QUANTITY,
  PAYMENT_LABEL,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "./schemas";

const DISCOUNT_LABEL: Record<DiscountMode, string> = {
  NONE: "None",
  AMOUNT: "Amount (₱)",
  PERCENT: "Percent (%)",
};

function Choice<T extends string>({
  legend,
  name,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-text text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option}
            className="border-border text-text has-checked:border-primary has-checked:bg-secondary flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="accent-primary"
            />
            <span>{labels[option]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-text tabular-nums">{children}</dd>
    </div>
  );
}

function toCartProduct(hit: SearchHit) {
  return {
    productId: hit.id,
    name: hit.name,
    code: hit.code,
    unitPrice: hit.sellingPrice,
    stockQuantity: hit.stockQuantity,
  };
}

export function CheckoutForm() {
  const router = useRouter();
  const discountId = useId();
  const { pending, fieldErrors, run, clearErrors } = useResultAction();
  const [lines, setLines] = useState<CartLine[]>([]);
  // Scans finish asynchronously, so every change builds on the latest cart, not the one a
  // callback saw when it started (two quick scans of one item must count as two).
  const latestLines = useRef<CartLine[]>([]);
  // Quantity boxes keep what was typed (even blank) while the cart holds the number.
  const [quantityText, setQuantityText] = useState<Record<string, string>>({});
  const [discountMode, setDiscountMode] = useState<DiscountMode>("NONE");
  const [discountText, setDiscountText] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [customerInfo, setCustomerInfo] = useState("");
  const commandId = useRef<string | null>(null);

  /** Any edit makes this a different sale, so it needs a new id. */
  function changed() {
    commandId.current = null;
    clearErrors();
  }

  function commit(next: CartLine[]) {
    latestLines.current = next;
    setLines(next);
  }

  function add(hit: SearchHit) {
    const outcome = addToCart(latestLines.current, toCartProduct(hit));
    if (!outcome.ok) {
      toast.error(outcome.message);
      return;
    }
    changed();
    commit(outcome.lines);
    const added = outcome.lines.find((line) => line.productId === hit.id);
    if (added) setQuantityText((text) => ({ ...text, [hit.id]: String(added.quantity) }));
  }

  async function addScanned(code: string) {
    try {
      const found = await lookupProductAction(code);
      if (!found.ok) toast.error(found.error.message);
      else if (found.data) add(found.data);
      else toast.error(`No product has the barcode “${code}”.`);
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    }
  }

  // No scanning into the cart while a sale is being saved.
  useBarcodeWedge((code) => void addScanned(code), !pending);

  function onQuantityInput(productId: string, text: string) {
    changed();
    setQuantityText((all) => ({ ...all, [productId]: text }));
    const quantity = /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
    commit(setQuantity(latestLines.current, productId, quantity));
  }

  function remove(productId: string) {
    changed();
    commit(removeLine(latestLines.current, productId));
  }

  function reset() {
    commandId.current = null;
    commit([]);
    setQuantityText({});
    setDiscountMode("NONE");
    setDiscountText("");
    setPaymentMethod("CASH");
    setCustomerInfo("");
  }

  const problems = lines.map(quantityProblem);
  const validLines = problems.every((problem) => problem === null);
  const subtotal = validLines ? saleTotals(lines, null).subtotal : 0;
  const discount = parseDiscount(discountMode, discountText, subtotal);
  const totals = validLines ? saleTotals(lines, discount.ok ? discount.discount : null) : null;
  const canSubmit = lines.length > 0 && validLines && discount.ok && !pending;
  const unitCount = validLines ? lines.reduce((sum, line) => sum + line.quantity, 0) : 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !discount.ok) return;
    commandId.current ??= crypto.randomUUID();
    const id = commandId.current;
    run(
      () =>
        recordSale({
          id,
          occurredAt: new Date().toISOString(),
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
          discount: discount.discount,
          paymentMethod,
          customerInfo,
        }),
      {
        success: (sale) =>
          `Sale recorded: ${formatPeso(sale.total)} by ${PAYMENT_LABEL[sale.paymentMethod]}.`,
        onSuccess: (sale) => {
          reset();
          showLowStockAlerts(sale.lowStockAlerts, (productId) =>
            router.push(`/products/${productId}`),
          );
          router.refresh();
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label="Checkout" noValidate>
      {/* Locked while saving, so nothing typed now is lost when the saved sale clears the form. */}
      <fieldset
        disabled={pending}
        className="grid min-w-0 items-start gap-6 lg:grid-cols-[1fr_22rem]"
      >
        <section aria-labelledby="cart-heading" className="space-y-4">
          <div className="bg-surface grid gap-3 rounded-lg p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <ProductSearch
              label="Add a product"
              placeholder="Type a name or code, or scan a barcode"
              onPick={add}
              autoFocus
            />
            <CameraScanButton onScan={(code) => void addScanned(code)} />
          </div>

          <div className="bg-surface rounded-lg p-4">
            <h2 id="cart-heading" className="text-text text-base font-semibold">
              Cart
            </h2>
            {lines.length === 0 ? (
              <p className="text-muted mt-3 flex items-center gap-2">
                <ShoppingCart aria-hidden className="size-4 shrink-0" />
                <span>No items yet. Search or scan to add products.</span>
              </p>
            ) : (
              <ul aria-label="Items in this sale" className="divide-border mt-2 divide-y">
                {lines.map((line, index) => {
                  const error = problems[index] ?? fieldErrors[lineKey(line.productId)]?.join(" ");
                  const errorId = `${line.productId}-error`;
                  const lineTotal = Number.isInteger(line.quantity)
                    ? formatPeso(line.unitPrice * line.quantity)
                    : "—";
                  return (
                    <li
                      key={line.productId}
                      aria-label={line.name}
                      className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[1fr_6rem_7rem_auto]"
                    >
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <p className="text-text truncate font-medium">{line.name}</p>
                        <p className="text-muted text-sm">
                          {line.code} · {formatPeso(line.unitPrice)} each · {line.stockQuantity} in
                          stock
                        </p>
                      </div>
                      <label className="flex items-center gap-2 sm:block">
                        <span className="text-muted text-sm sm:sr-only">Quantity</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={Math.min(line.stockQuantity, MAX_LINE_QUANTITY)}
                          step={1}
                          value={quantityText[line.productId] ?? String(line.quantity)}
                          onChange={(event) => onQuantityInput(line.productId, event.target.value)}
                          aria-label={`Quantity of ${line.name}`}
                          aria-invalid={Boolean(error) || undefined}
                          aria-describedby={error ? errorId : undefined}
                          className={`${inputClasses} w-24`}
                        />
                      </label>
                      <p className="text-text text-right tabular-nums">{lineTotal}</p>
                      <Button
                        variant="ghost"
                        icon={Trash2}
                        onClick={() => remove(line.productId)}
                        aria-label={`Remove ${line.name}`}
                        className="col-span-2 justify-self-start sm:col-span-1"
                      >
                        Remove
                      </Button>
                      {error && (
                        <p id={errorId} className="text-danger col-span-full text-[13px]">
                          {error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section
          aria-labelledby="payment-heading"
          className="bg-surface space-y-5 rounded-lg p-4 lg:sticky lg:top-4"
        >
          <h2 id="payment-heading" className="text-text text-base font-semibold">
            Payment
          </h2>

          <div className="space-y-2">
            <Choice
              legend="Discount"
              name="discountMode"
              options={["NONE", "AMOUNT", "PERCENT"] as const}
              labels={DISCOUNT_LABEL}
              value={discountMode}
              onChange={(mode) => {
                changed();
                setDiscountMode(mode);
              }}
            />
            {discountMode !== "NONE" && (
              <div className="space-y-1.5">
                <label htmlFor={discountId} className="text-text block text-sm font-medium">
                  {discountMode === "AMOUNT" ? "Discount amount (₱)" : "Discount percent (%)"}
                </label>
                <input
                  id={discountId}
                  name="discountValue"
                  inputMode="decimal"
                  autoComplete="off"
                  value={discountText}
                  onChange={(event) => {
                    changed();
                    setDiscountText(event.target.value);
                  }}
                  placeholder={discountMode === "AMOUNT" ? "e.g. 50" : "e.g. 10"}
                  aria-invalid={!discount.ok || undefined}
                  aria-describedby={!discount.ok ? `${discountId}-error` : undefined}
                  className={inputClasses}
                />
                {!discount.ok && (
                  <p id={`${discountId}-error`} className="text-danger text-[13px]">
                    {discount.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <Choice
            legend="Payment method"
            name="paymentMethod"
            options={PAYMENT_METHODS}
            labels={PAYMENT_LABEL}
            value={paymentMethod}
            onChange={(method) => {
              changed();
              setPaymentMethod(method);
            }}
          />

          <TextField
            label="Customer name or contact"
            name="customerInfo"
            maxLength={MAX_CUSTOMER_INFO}
            autoComplete="off"
            value={customerInfo}
            onChange={(event) => {
              changed();
              setCustomerInfo(event.target.value);
            }}
            errors={fieldErrors.customerInfo}
          />

          <dl aria-label="Sale total" className="border-border space-y-1.5 border-t pt-4">
            <SummaryRow label={`Subtotal (${unitCount} ${unitCount === 1 ? "item" : "items"})`}>
              {totals ? formatPeso(totals.subtotal) : "—"}
            </SummaryRow>
            <SummaryRow label="Discount">
              {totals && totals.discountAmount > 0 ? `-${formatPeso(totals.discountAmount)}` : "—"}
            </SummaryRow>
            <div className="flex justify-between gap-4 pt-1 text-lg font-semibold">
              <dt className="text-text">Total</dt>
              <dd className="text-text tabular-nums">{totals ? formatPeso(totals.total) : "—"}</dd>
            </div>
          </dl>

          {fieldErrors.items && (
            <p role="alert" className="text-danger text-[13px]">
              {fieldErrors.items.join(" ")}
            </p>
          )}

          <Button type="submit" icon={CheckCircle2} disabled={!canSubmit} className="w-full">
            {pending ? "Saving…" : "Complete sale"}
          </Button>
        </section>
      </fieldset>
    </form>
  );
}
