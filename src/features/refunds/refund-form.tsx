"use client";

// FR-039/040: refund all or part of a sale. Each line takes a quantity up to what's still
// refundable, and the money to return is previewed with the same rule the server uses. The
// command id is kept until the refund succeeds, so pressing "Yes, refund" again after a dropped
// connection can't refund twice.
import { ListChecks, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { inputClasses, TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { formatPeso } from "@/lib/money";
import { refundSale } from "./actions";
import type { SaleLine } from "./queries";
import { refundAmounts } from "./refund-math";
import { MAX_REFUND_NOTE, refundLineKey } from "./schemas";

type Props = {
  saleId: string;
  /** Centavos, before and after the sale's discount. */
  subtotal: number;
  total: number;
  items: SaleLine[];
};

function left(item: SaleLine): number {
  return item.quantity - item.refundedQuantity;
}

/** "" and anything that isn't a whole number count as 0 here; the server checks the rest. */
function parseQuantity(text: string | undefined): number {
  return text && /^\d+$/.test(text.trim()) ? Number(text.trim()) : 0;
}

export function RefundForm({ saleId, subtotal, total, items }: Props) {
  const router = useRouter();
  const { pending, fieldErrors, run, clearErrors } = useResultAction();
  const commandId = useRef<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const refundable = items.filter((item) => left(item) > 0);
  const chosen = refundable
    .map((item) => ({ item, quantity: parseQuantity(quantities[item.id]) }))
    .filter(({ quantity }) => quantity > 0);
  const tooMany = chosen.some(({ item, quantity }) => quantity > left(item));
  const units = chosen.reduce((sum, { quantity }) => sum + quantity, 0);
  const restockUnits = chosen
    .filter(({ item }) => item.productId)
    .reduce((sum, { quantity }) => sum + quantity, 0);
  const amount = tooMany
    ? 0
    : refundAmounts(
        { subtotal, total },
        items.map((item) => ({ unitPrice: item.unitPrice, quantity: item.refundedQuantity })),
        chosen.map(({ item, quantity }) => ({ unitPrice: item.unitPrice, quantity })),
      ).reduce((sum, value) => sum + value, 0);

  function edited() {
    commandId.current = null;
  }

  function setQuantity(id: string, value: string) {
    edited();
    setQuantities((current) => ({ ...current, [id]: value }));
  }

  function chooseAll() {
    edited();
    setQuantities(Object.fromEntries(refundable.map((item) => [item.id, String(left(item))])));
  }

  function submit() {
    commandId.current ??= crypto.randomUUID();
    const id = commandId.current;
    run(
      () =>
        refundSale({
          id,
          occurredAt: new Date().toISOString(),
          saleId,
          items: chosen.map(({ item, quantity }) => ({ saleItemId: item.id, quantity })),
          note,
        }),
      {
        success: (result) =>
          `Refunded ${formatPeso(result.amount)}. Give this back to the customer.`,
        onSuccess: () => {
          commandId.current = null;
          setQuantities({});
          setNote("");
          clearErrors();
          router.refresh();
        },
      },
    );
  }

  if (refundable.length === 0) return null;
  const unitsLabel = units === 1 ? "1 item" : `${units} items`;
  const restockLabel = restockUnits === 1 ? "1 item" : `${restockUnits} items`;

  return (
    <section aria-labelledby="refund-title" className="bg-surface space-y-4 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="refund-title" className="text-text text-base font-semibold">
          Refund
        </h2>
        <Button variant="ghost" icon={ListChecks} onClick={chooseAll} disabled={pending}>
          Choose everything left
        </Button>
      </div>
      <p className="text-muted text-sm">
        Enter how many of each item the customer is returning. Returned items go back into stock.
      </p>

      <ul aria-label="Items to refund" className="divide-border divide-y">
        {refundable.map((item) => {
          const inputId = `refund-${item.id}`;
          const errors = fieldErrors[refundLineKey(item.id)];
          const quantity = parseQuantity(quantities[item.id]);
          const over = quantity > left(item);
          const errorText = over ? `Only ${left(item)} can be refunded.` : errors?.join(" ");
          return (
            <li key={item.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_8rem] sm:items-start">
              <div className="min-w-0">
                <label htmlFor={inputId} className="text-text block font-medium">
                  {item.productName}
                  <span className="sr-only"> refund quantity</span>
                </label>
                <p className="text-muted text-sm">
                  {item.productCode} · {formatPeso(item.unitPrice)} each · {left(item)} of{" "}
                  {item.quantity} can be refunded
                </p>
                {!item.productId && (
                  <p className="text-warn text-sm">Product deleted, stock not restored.</p>
                )}
              </div>
              <div className="space-y-1">
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={left(item)}
                  step={1}
                  placeholder="0"
                  value={quantities[item.id] ?? ""}
                  onChange={(event) => setQuantity(item.id, event.target.value)}
                  aria-invalid={Boolean(errorText) || undefined}
                  aria-describedby={errorText ? `${inputId}-error` : undefined}
                  className={inputClasses}
                />
                {errorText && (
                  <p id={`${inputId}-error`} className="text-danger text-[13px]">
                    {errorText}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <TextField
        label="Reason"
        name="note"
        maxLength={MAX_REFUND_NOTE}
        placeholder="e.g. Wrong size"
        value={note}
        onChange={(event) => {
          edited();
          setNote(event.target.value);
        }}
        errors={fieldErrors.note}
      />
      {fieldErrors.items && (
        <p role="alert" className="text-danger text-sm">
          {fieldErrors.items.join(" ")}
        </p>
      )}

      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-text" aria-live="polite">
          {units > 0 && !tooMany ? (
            <>
              Money to return ({unitsLabel}): <strong>{formatPeso(amount)}</strong>
            </>
          ) : (
            <span className="text-muted">Choose at least one item to refund.</span>
          )}
        </p>
        {units > 0 && !tooMany ? (
          <ConfirmButton
            key={`${amount}-${units}`}
            icon={Undo2}
            variant="primary"
            label={`Refund ${formatPeso(amount)}`}
            question={
              restockUnits > 0
                ? `Return ${formatPeso(amount)} to the customer and put ${restockLabel} back in stock?`
                : `Return ${formatPeso(amount)} to the customer?`
            }
            confirmLabel="Yes, refund"
            onConfirm={submit}
            pending={pending}
          />
        ) : (
          <Button icon={Undo2} disabled>
            Refund
          </Button>
        )}
      </div>
    </section>
  );
}
