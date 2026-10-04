"use client";

// FR-039/040: refund all or part of a sale. Each line takes a quantity up to what's still
// refundable and a "Return to stock" choice (on by default; off for damaged items, H4.2), and the
// money to return is previewed with the same rule the server uses. A reason is required (H4.4). The
// command id is kept until the refund succeeds, so pressing "Yes, refund" again after a dropped
// connection can't refund twice. Offline, the refund is saved on this device and syncs later
// (FR-034, leaf 6.2). A sale recorded offline can be refunded before it syncs: its lines have no
// ids yet, so the refund names them by product and is sent after the sale (FR-049, leaf 9.3).
import { ListChecks, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { inputClasses, TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { formatPeso } from "@/lib/money";
import { runCommand } from "@/lib/offline/sync";
import type { SaleLine } from "./queries";
import { refundAmounts } from "./refund-math";
import { MAX_REFUND_NOTE, refundLineKey, type RefundLineRef } from "./schemas";

type Props = {
  saleId: string;
  /** Centavos, before and after the sale's discount. */
  subtotal: number;
  total: number;
  items: SaleLine[];
  /** The sale is still waiting to sync, so its lines are named by product. */
  unsynced?: boolean;
};

function left(item: SaleLine): number {
  return item.quantity - item.refundedQuantity;
}

/** "" and anything that isn't a whole number count as 0 here; the server checks the rest. */
function parseQuantity(text: string | undefined): number {
  return text && /^\d+$/.test(text.trim()) ? Number(text.trim()) : 0;
}

export function RefundForm({ saleId, subtotal, total, items, unsynced = false }: Props) {
  const router = useRouter();
  const { pending, fieldErrors, run, clearErrors } = useResultAction();
  const commandId = useRef<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  /** Sale lines whose refunded units stay out of stock. Every other line goes back on the shelf. */
  const [keptOut, setKeptOut] = useState<Record<string, boolean>>({});

  const refundable = items.filter((item) => left(item) > 0);
  const chosen = refundable
    .map((item) => ({ item, quantity: parseQuantity(quantities[item.id]) }))
    .filter(({ quantity }) => quantity > 0);
  const tooMany = chosen.some(({ item, quantity }) => quantity > left(item));
  const units = chosen.reduce((sum, { quantity }) => sum + quantity, 0);
  const returnsToStock = (item: SaleLine) => Boolean(item.productId) && !keptOut[item.id];
  const restockUnits = chosen
    .filter(({ item }) => returnsToStock(item))
    .reduce((sum, { quantity }) => sum + quantity, 0);
  const keptOutUnits = chosen
    .filter(({ item }) => item.productId && keptOut[item.id])
    .reduce((sum, { quantity }) => sum + quantity, 0);
  const lineRef = (item: SaleLine): RefundLineRef =>
    unsynced && item.productId ? { productId: item.productId } : { saleItemId: item.id };
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

  function setReturnToStock(id: string, value: boolean) {
    edited();
    setKeptOut((current) => ({ ...current, [id]: !value }));
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
        runCommand("REFUND", {
          id,
          occurredAt: new Date().toISOString(),
          saleId,
          items: chosen.map(({ item, quantity }) => ({
            ...lineRef(item),
            quantity,
            returnToStock: returnsToStock(item),
          })),
          note,
        }),
      {
        success: (result) =>
          result.queued
            ? `Refund of ${formatPeso(amount)} saved on this device. Give this back to the customer. It will sync when you're back online.`
            : `Refunded ${formatPeso(result.amount)}. Give this back to the customer.`,
        onSuccess: (result) => {
          commandId.current = null;
          setQuantities({});
          setKeptOut({});
          setNote("");
          clearErrors();
          if (!result.queued) router.refresh();
        },
      },
    );
  }

  if (refundable.length === 0) return null;
  const unitsLabel = units === 1 ? "1 item" : `${units} items`;
  const itemsLabel = (count: number) => (count === 1 ? "1 item" : `${count} items`);
  const question =
    `Return ${formatPeso(amount)} to the customer` +
    (restockUnits > 0 ? ` and put ${itemsLabel(restockUnits)} back in stock?` : "?") +
    (keptOutUnits > 0 ? ` ${itemsLabel(keptOutUnits)} won't go back in stock.` : "");

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
        Enter how many of each item the customer is returning. Returned items go back into stock;
        untick &ldquo;Return to stock&rdquo; for damaged ones so they aren&apos;t sold again.
      </p>

      <ul aria-label="Items to refund" className="divide-border divide-y">
        {refundable.map((item) => {
          const inputId = `refund-${item.id}`;
          const errors = fieldErrors[refundLineKey(lineRef(item))];
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
                {item.productId ? (
                  <label className="text-text flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!keptOut[item.id]}
                      onChange={(event) => setReturnToStock(item.id, event.target.checked)}
                      className="size-4"
                    />
                    Return to stock
                    <span className="sr-only">: {item.productName}</span>
                  </label>
                ) : (
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
        required
        maxLength={MAX_REFUND_NOTE}
        placeholder="e.g. Wrong size, or damaged"
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
            key={`${amount}-${units}-${restockUnits}`}
            icon={Undo2}
            variant="primary"
            label={`Refund ${formatPeso(amount)}`}
            question={question}
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
