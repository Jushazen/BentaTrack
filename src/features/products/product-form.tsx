"use client";

// Add and edit product form (FR-001–003, FR-037). Owner-only fields (purchase price, supplier)
// are rendered, and therefore sent, only when `suppliers` is given (FR-032, A7 follow-on).
// Photos are shrunk in the browser first: server actions accept at most 1 MB per request.
import { Plus, Save, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { showLowStockAlerts } from "@/components/layout/low-stock-alerts";
import { buttonClasses, Button } from "@/components/ui/button";
import { inputClasses, TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { createProduct, updateProduct } from "./actions";
import type { ProductDetail } from "./queries";

type Option = { id: string; name: string };

export type ImageRules = { maxBytes: number; acceptedTypes: string };

type ProductFormProps = {
  product?: ProductDetail;
  categories: Option[];
  /** Null for staff: no purchase price or supplier fields at all. */
  suppliers: Option[] | null;
  imageRules: ImageRules;
};

const SHRINK_ABOVE_BYTES = 500 * 1024;
const MAX_EDGE_PX = 1280;

/** 89950 → "899.50", without going through floating point. */
function pesoInput(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
}

/** Large or unusual photos become a ≤1280px JPEG. Falls back to the original if decoding fails. */
async function shrinkImage(file: File, acceptedTypes: string): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES && acceptedTypes.split(",").includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]*$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function SelectField({
  label,
  name,
  required,
  defaultValue,
  errors,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  errors?: string[];
  children: ReactNode;
}) {
  const id = useId();
  const hasError = Boolean(errors?.length);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-text block text-sm font-medium">
        {label}
        {!required && <span className="text-muted font-normal"> (optional)</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${id}-error` : undefined}
        className={inputClasses}
      >
        {children}
      </select>
      {hasError && (
        <p id={`${id}-error`} className="text-danger text-[13px]">
          {errors?.join(" ")}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="bg-surface rounded-lg p-4 lg:p-6">
      <h2 id={id} className="text-text mb-4 text-lg font-semibold">
        {title}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function PhotoField({
  currentUrl,
  rules,
  photo,
  onPhoto,
  removeImage,
  onRemoveImage,
  errors,
}: {
  currentUrl: string | null;
  rules: ImageRules;
  photo: File | null;
  onPhoto: (file: File | null) => void;
  removeImage: boolean;
  onRemoveImage: (remove: boolean) => void;
  errors?: string[];
}) {
  const id = useId();
  const [preparing, setPreparing] = useState(false);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreparing(true);
    onPhoto(await shrinkImage(file, rules.acceptedTypes));
    setPreparing(false);
  }

  const shown = photo ? preview : removeImage ? null : currentUrl;
  const hasError = Boolean(errors?.length);
  return (
    <div className="flex flex-wrap items-start gap-4 md:col-span-2">
      <div className="bg-secondary relative size-28 shrink-0 overflow-hidden rounded-lg">
        {shown ? (
          <Image src={shown} alt="Photo preview" fill unoptimized className="object-cover" />
        ) : (
          <p className="text-muted flex h-full items-center justify-center p-2 text-center text-sm">
            No photo
          </p>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <label htmlFor={id} className="text-text block text-sm font-medium">
          Photo <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id={id}
          type="file"
          accept={rules.acceptedTypes}
          onChange={onChange}
          aria-invalid={hasError || undefined}
          aria-describedby={`${id}-hint${hasError ? ` ${id}-error` : ""}`}
          className="text-text file:bg-secondary file:text-text block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:px-4 file:font-medium"
        />
        <p id={`${id}-hint`} className="text-muted text-[13px]">
          {preparing
            ? "Preparing photo…"
            : "JPEG, PNG, or WebP. Large photos are shrunk automatically."}
        </p>
        {hasError && (
          <p id={`${id}-error`} className="text-danger text-[13px]">
            {errors?.join(" ")}
          </p>
        )}
        {photo && (
          <Button variant="ghost" icon={X} onClick={() => onPhoto(null)}>
            Don&apos;t use this photo
          </Button>
        )}
        {!photo && currentUrl && (
          <label className="text-text flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={removeImage}
              onChange={(e) => onRemoveImage(e.target.checked)}
              className="size-4"
            />
            Remove the current photo
          </label>
        )}
      </div>
    </div>
  );
}

export function ProductForm({ product, categories, suppliers, imageRules }: ProductFormProps) {
  const router = useRouter();
  const { pending, fieldErrors, run } = useResultAction();
  const [photo, setPhoto] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const editing = product !== undefined;
  const photoTooLarge = photo !== null && photo.size > imageRules.maxBytes;
  const photoErrors = photoTooLarge
    ? ["That photo is still too large after shrinking. Try a smaller one."]
    : fieldErrors.image;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photoTooLarge) return;
    const data = new FormData(event.currentTarget);
    if (photo) data.set("image", photo, photo.name);
    const openProduct = (id: string) => router.push(`/products/${id}`);

    if (editing) {
      data.set("id", product.id);
      data.set("stockWhenLoaded", String(product.stockQuantity));
      if (removeImage && !photo) data.set("removeImage", "true");
      run(() => updateProduct(data), {
        success: (saved) => `Saved ${saved.name}.`,
        onSuccess: (saved) => {
          showLowStockAlerts(saved.lowStockAlerts, openProduct);
          openProduct(saved.id);
        },
      });
    } else {
      run(() => createProduct(data), {
        success: (saved) => `${saved.name} added.`,
        onSuccess: (saved) => openProduct(saved.id),
      });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Section title="Details">
        <TextField
          label="Product name"
          name="name"
          required
          autoComplete="off"
          defaultValue={product?.name}
          errors={fieldErrors.name}
        />
        <TextField
          label="Product code"
          name="code"
          required
          autoComplete="off"
          hint="Your own code, e.g. BAG-001."
          defaultValue={product?.code}
          errors={fieldErrors.code}
        />
        <TextField
          label="Barcode"
          name="barcode"
          autoComplete="off"
          inputMode="numeric"
          hint="Scan or type the number under the barcode."
          defaultValue={product?.barcode ?? ""}
          errors={fieldErrors.barcode}
        />
        <SelectField
          label="Category"
          name="categoryId"
          required
          defaultValue={product?.categoryId ?? ""}
          errors={fieldErrors.categoryId}
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Brand"
          name="brand"
          autoComplete="off"
          defaultValue={product?.brand ?? ""}
          errors={fieldErrors.brand}
        />
        <TextField
          label="Expiration date"
          name="expirationDate"
          type="date"
          defaultValue={product?.expirationDate ?? ""}
          errors={fieldErrors.expirationDate}
        />
        <PhotoField
          currentUrl={product?.imageUrl ?? null}
          rules={imageRules}
          photo={photo}
          onPhoto={setPhoto}
          removeImage={removeImage}
          onRemoveImage={setRemoveImage}
          errors={photoErrors}
        />
      </Section>

      <Section title="Price and stock">
        <TextField
          label="Selling price (₱)"
          name="sellingPrice"
          required
          inputMode="decimal"
          autoComplete="off"
          defaultValue={pesoInput(product?.sellingPrice)}
          errors={fieldErrors.sellingPrice}
        />
        {suppliers && (
          <TextField
            label="Purchase price (₱)"
            name="purchasePrice"
            inputMode="decimal"
            autoComplete="off"
            hint="What you paid. Only you can see this."
            defaultValue={pesoInput(product?.costs?.purchasePrice)}
            errors={fieldErrors.purchasePrice}
          />
        )}
        <TextField
          label="Stock quantity"
          name="stockQuantity"
          required
          inputMode="numeric"
          autoComplete="off"
          hint={
            editing
              ? "Change this only to correct a miscount. Use Restock for deliveries."
              : undefined
          }
          defaultValue={String(product?.stockQuantity ?? 0)}
          errors={fieldErrors.stockQuantity}
        />
        <TextField
          label="Low stock threshold"
          name="lowStockThreshold"
          inputMode="numeric"
          autoComplete="off"
          hint="Marked Low Stock at or below this many. Default 5."
          defaultValue={String(product?.lowStockThreshold ?? 5)}
          errors={fieldErrors.lowStockThreshold}
        />
        {suppliers && (
          <SelectField
            label="Supplier"
            name="supplierId"
            defaultValue={product?.costs?.supplierId ?? ""}
            errors={fieldErrors.supplierId}
          >
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        )}
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon={editing ? Save : Plus} disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add product"}
        </Button>
        <Link
          href={editing ? `/products/${product.id}` : "/products"}
          className={buttonClasses("ghost")}
        >
          <X aria-hidden className="size-4 shrink-0" />
          <span>Cancel</span>
        </Link>
      </div>
      {!editing && categories.length === 0 && (
        <p role="alert" className="text-danger">
          There are no categories yet. The owner needs to add one first.
        </p>
      )}
    </form>
  );
}
