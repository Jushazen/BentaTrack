"use client";

// FR-041: owner adds, edits, and deletes supplier records. Deleting a supplier keeps its
// products and clears their supplier, and the confirmation says how many that affects.
import { Mail, MapPin, Pencil, Phone, Plus, Save, Trash2, User, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { createSupplier, deleteSupplier, updateSupplier } from "./actions";
import type { SupplierRow } from "./queries";

type SupplierFormProps = {
  supplier?: SupplierRow;
  onDone?: () => void;
};

/** Add form when `supplier` is missing, edit form otherwise. */
function SupplierForm({ supplier, onDone }: SupplierFormProps) {
  const { pending, fieldErrors, run } = useResultAction();
  const editing = supplier !== undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fields = {
      name: String(data.get("name") ?? ""),
      contactPerson: String(data.get("contactPerson") ?? ""),
      phone: String(data.get("phone") ?? ""),
      email: String(data.get("email") ?? ""),
      address: String(data.get("address") ?? ""),
    };
    if (editing) {
      run(() => updateSupplier({ id: supplier.id, ...fields }), {
        success: (saved) => `Saved ${saved.name}.`,
        onSuccess: onDone,
      });
    } else {
      run(() => createSupplier(fields), {
        success: (saved) => `Supplier ${saved.name} added.`,
        onSuccess: () => form.reset(),
      });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
      <TextField
        label="Supplier name"
        name="name"
        required
        autoComplete="off"
        defaultValue={supplier?.name}
        errors={fieldErrors.name}
      />
      <TextField
        label="Contact person"
        name="contactPerson"
        autoComplete="off"
        defaultValue={supplier?.contactPerson ?? ""}
        errors={fieldErrors.contactPerson}
      />
      <TextField
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="off"
        defaultValue={supplier?.phone ?? ""}
        errors={fieldErrors.phone}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="off"
        defaultValue={supplier?.email ?? ""}
        errors={fieldErrors.email}
      />
      <TextField
        label="Address"
        name="address"
        autoComplete="off"
        defaultValue={supplier?.address ?? ""}
        errors={fieldErrors.address}
        className="md:col-span-2"
      />
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" icon={editing ? Save : Plus} disabled={pending}>
          {pending ? "Saving…" : editing ? "Save supplier" : "Add supplier"}
        </Button>
        {editing && (
          <Button variant="ghost" icon={X} onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <p className="text-muted flex items-start gap-2 text-sm">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <span className="sr-only">{label}: </span>
      <span className="break-words">{value}</span>
    </p>
  );
}

function SupplierItem({ supplier }: { supplier: SupplierRow }) {
  const [editing, setEditing] = useState(false);
  const { pending, run } = useResultAction();
  const count = supplier.productCount;

  if (editing) {
    return (
      <li className="py-4 first:pt-0 last:pb-0">
        <p className="text-text mb-3 font-medium">Edit {supplier.name}</p>
        <SupplierForm supplier={supplier} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const unlinkNote =
    count === 0
      ? ""
      : ` ${count === 1 ? "1 product" : `${count} products`} will no longer have a supplier.`;

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-text font-medium">{supplier.name}</p>
        <Detail icon={User} label="Contact person" value={supplier.contactPerson} />
        <Detail icon={Phone} label="Phone" value={supplier.phone} />
        <Detail icon={Mail} label="Email" value={supplier.email} />
        <Detail icon={MapPin} label="Address" value={supplier.address} />
        <p className="text-muted text-sm">
          {count === 0 ? "No products" : count === 1 ? "1 product" : `${count} products`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
          Edit
        </Button>
        <ConfirmButton
          icon={Trash2}
          label="Delete"
          question={`Delete ${supplier.name}?${unlinkNote}`}
          confirmLabel="Yes, delete"
          pending={pending}
          onConfirm={() =>
            run(() => deleteSupplier({ id: supplier.id }), {
              success: `Supplier ${supplier.name} deleted.`,
            })
          }
        />
      </div>
    </li>
  );
}

export function SupplierManager({ suppliers }: { suppliers: SupplierRow[] }) {
  return (
    <>
      <section aria-labelledby="add-supplier-title" className="bg-surface rounded-lg p-4 lg:p-6">
        <h2 id="add-supplier-title" className="text-text mb-4 text-lg font-semibold">
          Add supplier
        </h2>
        <SupplierForm />
      </section>
      <section aria-labelledby="suppliers-title" className="bg-surface rounded-lg p-4 lg:p-6">
        <h2 id="suppliers-title" className="text-text text-lg font-semibold">
          Suppliers
        </h2>
        {suppliers.length === 0 ? (
          <p className="text-muted mt-2">No suppliers yet. Add the first one above.</p>
        ) : (
          <ul className="divide-border mt-4 divide-y" aria-label="Suppliers">
            {suppliers.map((supplier) => (
              <SupplierItem key={supplier.id} supplier={supplier} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
