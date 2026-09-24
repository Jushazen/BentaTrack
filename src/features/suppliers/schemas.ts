// Zod input schemas: Owner-only supplier records (FR-041–042). Leaf 3.3.
import { z } from "zod";

/** Blank optional fields are stored as null, not "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((value) => value || null);

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((value) => value || null)
  .pipe(
    z.email({ message: "Enter a valid email address, or leave it blank." }).max(254).nullable(),
  );

const id = z.string().min(1, "Missing supplier.");

const supplierFields = {
  name: z.string().trim().min(1, "Enter the supplier's name.").max(120, "Name is too long."),
  contactPerson: optionalText(120),
  phone: optionalText(40),
  email: optionalEmail,
  address: optionalText(300),
};

export const createSupplierSchema = z.object(supplierFields);
export const updateSupplierSchema = z.object({ id, ...supplierFields });
export const deleteSupplierSchema = z.object({ id });

export type SupplierInput = z.input<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.input<typeof updateSupplierSchema>;
export type DeleteSupplierInput = z.input<typeof deleteSupplierSchema>;
