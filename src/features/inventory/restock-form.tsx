"use client";

// FR-038: record units received for one product. The command id is kept until the restock
// succeeds, so pressing "Restock" again after a dropped connection can't add the stock twice.
import { PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { restockProduct } from "./actions";
import { MAX_RESTOCK_QUANTITY } from "./schemas";

export function RestockForm({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const { pending, fieldErrors, run } = useResultAction();
  const commandId = useRef<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const quantityText = String(data.get("quantity") ?? "").trim();
    commandId.current ??= crypto.randomUUID();
    const id = commandId.current;
    run(
      () =>
        restockProduct({
          id,
          occurredAt: new Date().toISOString(),
          productId,
          // Blank or non-numeric input becomes NaN, which the server rejects with a field error.
          quantity: /^\d+$/.test(quantityText) ? Number(quantityText) : Number.NaN,
          note: String(data.get("note") ?? ""),
        }),
      {
        success: (result) =>
          `Added ${result.quantity} to ${result.productName}. ${result.stockAfter} in stock now.`,
        onSuccess: () => {
          commandId.current = null;
          form.reset();
          router.refresh();
        },
      },
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={`Restock ${productName}`}
      className="bg-surface space-y-3 rounded-lg p-4"
      noValidate
    >
      <h2 className="text-text text-base font-semibold">Restock</h2>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <TextField
          label="Quantity received"
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_RESTOCK_QUANTITY}
          step={1}
          required
          errors={fieldErrors.quantity}
          onInput={() => (commandId.current = null)}
        />
        <TextField
          label="Note"
          name="note"
          maxLength={500}
          placeholder="e.g. Delivery from supplier"
          errors={fieldErrors.note}
          onInput={() => (commandId.current = null)}
        />
      </div>
      <Button type="submit" icon={PackagePlus} disabled={pending}>
        {pending ? "Saving…" : "Restock"}
      </Button>
    </form>
  );
}
