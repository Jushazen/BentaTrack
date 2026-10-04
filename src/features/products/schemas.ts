// Zod input schemas: Product records (FR-001–006, FR-037). Leaf 3.2.
// Product forms post FormData (they carry a photo), so every field arrives as a string or File.
// Prices are typed in pesos ("1,234.50") and stored as integer centavos.
// Browser-safe: the device checks a change with these schemas before queuing it offline, and
// sends it to /api/sync as a ProductCommand, which becomes the same FormData (leaf 9.4).
import { z } from "zod";
import { parsePeso } from "@/lib/money";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/stock-status";
import { IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, isImageType } from "./image-rules";

const MAX_COUNT = 1_000_000;
/** Allowance for a device clock that runs a little fast (FR-054). */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// `{ error }` also covers a missing field: a select left on its disabled placeholder isn't posted.
const id = (message: string) => z.string({ error: message }).trim().min(1, message);

const requiredText = (max: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(max, `Keep this under ${max} characters.`);

/** Blank optional fields are stored as null, not "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((value) => value || null);

const pesos = (message: string) =>
  z.string({ error: message }).transform((value, ctx) => {
    const centavos = parsePeso(value);
    if (centavos === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return centavos;
  });

const wholeNumber = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(z.number().max(MAX_COUNT, `Use a number up to ${MAX_COUNT.toLocaleString("en-PH")}.`));

const barcode = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null)
  .pipe(
    z
      .string()
      .regex(/^[A-Za-z0-9-]{1,64}$/, "Use only letters, numbers, and dashes (no spaces).")
      .nullable(),
  );

const expirationDate = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date, or leave it blank." });
      return z.NEVER;
    }
    return date;
  });

const lowStockThreshold = z
  .string()
  .optional()
  .transform((value) => value?.trim() || String(DEFAULT_LOW_STOCK_THRESHOLD))
  .pipe(wholeNumber("Enter a whole number, 0 or more."));

/** An empty file input submits a zero-byte File; that means "no new photo". */
const image = z
  .instanceof(File)
  .optional()
  .transform((file) => (file && file.size > 0 ? file : undefined))
  .refine((file) => !file || isImageType(file.type), "Choose a JPEG, PNG, or WebP photo.")
  .refine((file) => !file || file.size <= MAX_IMAGE_BYTES, "That photo is too large.");

/**
 * Owner-only fields (FR-032, FR-042). Missing from the form = leave unchanged (staff forms never
 * send them); present but blank = clear it.
 */
const purchasePrice = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (!value.trim()) return null;
    const centavos = parsePeso(value);
    if (centavos === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 450 or 450.50." });
      return z.NEVER;
    }
    return centavos;
  });

const supplierId = z
  .string()
  .optional()
  .transform((value) => (value === undefined ? undefined : value.trim() || null));

/**
 * A change sent from a device (leaf 9.4) carries its client-generated UUID, so a replay is never
 * applied twice, and the device's time, which the inventory history records (FR-054). Both are
 * absent on a direct call.
 */
const commandId = z
  .uuid({ error: "This change is missing its id. Reload and try again." })
  .optional();

const occurredAt = z.iso
  .datetime({ offset: true, error: "This change is missing its time." })
  .transform((value) => new Date(value))
  .refine((date) => date.getTime() <= Date.now() + CLOCK_SKEW_MS, {
    error: "This change's time is in the future. Check the device clock.",
  })
  .optional();

const detailFields = {
  name: requiredText(120, "Enter the product name."),
  code: requiredText(40, "Enter a product code."),
  barcode,
  categoryId: id("Choose a category."),
  brand: optionalText(80),
  sellingPrice: pesos("Enter a price like 899 or 899.50.").refine(
    (centavos) => centavos > 0,
    "The selling price must be more than ₱0.00.",
  ),
  lowStockThreshold,
  expirationDate,
  purchasePrice,
  supplierId,
  image,
};

export const createProductSchema = z.object({
  /** The new product's id when a device made it (so later offline changes can name it). */
  id: commandId,
  occurredAt,
  ...detailFields,
  stockQuantity: wholeNumber("Enter how many are in stock (0 or more)."),
});

export const updateProductSchema = z.object({
  id: id("Missing product."),
  commandId,
  occurredAt,
  ...detailFields,
  stockQuantity: wholeNumber("Enter how many are in stock (0 or more)."),
  /** The stock shown when the form opened, so a sale made meanwhile isn't overwritten. */
  stockWhenLoaded: wholeNumber("Reload the page and try again."),
  removeImage: z
    .literal("true")
    .optional()
    .transform((value) => value === "true"),
});

/** Archive or restore (FR-004, H1): the owner picks a product by id. */
export const productIdSchema = z.object({ id: id("Missing product."), commandId, occurredAt });

export type CreateProductInput = z.output<typeof createProductSchema>;
export type UpdateProductInput = z.output<typeof updateProductSchema>;
export type ProductIdInput = z.input<typeof productIdSchema>;

// The list filters live in ./filters.ts, which the browser can import (this module needs node:fs
// through @/lib/storage); the offline product list parses with the same schema (leaf 9.2).
export { productFiltersSchema, type ProductFilters } from "./filters";

export const ACCEPTED_IMAGE_TYPES = Object.keys(IMAGE_EXTENSIONS).join(",");

// ---- Changes sent from a device (leaf 9.4) -------------------------------------------

/** A photo waiting on the device, as a data: URL, until the change syncs. */
export type CommandImage = { name: string; dataUrl: string };

/**
 * Adding or editing a product as an offline-capable command: the form's fields as text, plus
 * the photo. Adding: `id` is the new product's id (and the change's id). Editing: `id` is the
 * product, `commandId` the change.
 */
export type ProductCommand = {
  id: string;
  commandId?: string;
  occurredAt: string;
  fields: Record<string, string>;
  image: CommandImage | null;
};

/** Archiving or restoring a product as an offline-capable command. */
export type ProductIdCommand = { id: string; commandId: string; occurredAt: string };

/** data: URL → File. Null if it isn't a base64 data: URL. */
export function dataUrlToFile(image: CommandImage): File | null {
  const match = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]*)$/.exec(image.dataUrl);
  if (!match) return null;
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], image.name || "photo", { type: match[1] });
}

/** The FormData the product actions take, built from a device's command. */
export function productCommandForm(command: ProductCommand): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(command.fields ?? {})) {
    if (typeof value === "string") form.set(key, value);
  }
  form.set("id", String(command.id));
  if (command.commandId !== undefined) form.set("commandId", String(command.commandId));
  form.set("occurredAt", String(command.occurredAt));
  const file = command.image ? dataUrlToFile(command.image) : null;
  // An unreadable photo becomes a non-image file, which the schema refuses with its message.
  if (command.image) form.set("image", file ?? new File(["?"], "photo", { type: "text/plain" }));
  return form;
}

/** FormData → plain object for the schemas above. */
export function formToObject(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}
