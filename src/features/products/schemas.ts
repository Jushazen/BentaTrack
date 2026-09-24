// Zod input schemas: Product records (FR-001–006, FR-037). Leaf 3.2.
// Product forms post FormData (they carry a photo), so every field arrives as a string or File.
// Prices are typed in pesos ("1,234.50") and stored as integer centavos.
import { z } from "zod";
import { parsePeso } from "@/lib/money";
import { IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, isImageType } from "@/lib/storage";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/stock-status";

const MAX_COUNT = 1_000_000;

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
  ...detailFields,
  stockQuantity: wholeNumber("Enter how many are in stock (0 or more)."),
});

export const updateProductSchema = z.object({
  id: id("Missing product."),
  ...detailFields,
  stockQuantity: wholeNumber("Enter how many are in stock (0 or more)."),
  /** The stock shown when the form opened, so a sale made meanwhile isn't overwritten. */
  stockWhenLoaded: wholeNumber("Reload the page and try again."),
  removeImage: z
    .literal("true")
    .optional()
    .transform((value) => value === "true"),
});

export const deleteProductSchema = z.object({ id: id("Missing product.") });

export type CreateProductInput = z.output<typeof createProductSchema>;
export type UpdateProductInput = z.output<typeof updateProductSchema>;
export type DeleteProductInput = z.input<typeof deleteProductSchema>;

/** Filters on the product list page (read from the URL). */
export const productFiltersSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  category: z.string().trim().min(1).optional().catch(undefined),
  /** low = Low Stock or Out of Stock; out = Out of Stock only. */
  stock: z.enum(["low", "out"]).optional().catch(undefined),
  /** Owner only: products with no purchase price yet (A7 follow-on). */
  cost: z.literal("missing").optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type ProductFilters = z.output<typeof productFiltersSchema>;

export const ACCEPTED_IMAGE_TYPES = Object.keys(IMAGE_EXTENSIONS).join(",");

/** FormData → plain object for the schemas above. */
export function formToObject(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}
