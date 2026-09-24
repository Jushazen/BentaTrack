// Zod input schemas: Owner-managed categories (FR-043). Leaf 3.3.
import { z } from "zod";

const id = z.string().min(1, "Missing category.");
const name = z.string().trim().min(1, "Enter a category name.").max(60, "Name is too long.");

export const createCategorySchema = z.object({ name });
export const renameCategorySchema = z.object({ id, name });
export const deleteCategorySchema = z.object({ id });

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type RenameCategoryInput = z.input<typeof renameCategorySchema>;
export type DeleteCategoryInput = z.input<typeof deleteCategorySchema>;
