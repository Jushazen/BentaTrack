// Zod input schemas: Owner-managed categories (FR-043). Leaf 3.3.
import { z } from "zod";

const id = z.string().min(1, "Missing category.");
/**
 * Sent from a device (leaf 9.4): the change's client-generated UUID, so a replay is applied once.
 * Adding: the new category's id, so a product added offline can be put in it before it syncs.
 */
const commandId = z
  .uuid({ error: "This change is missing its id. Reload and try again." })
  .optional();
const name = z.string().trim().min(1, "Enter a category name.").max(60, "Name is too long.");

export const createCategorySchema = z.object({ id: commandId, name });
export const renameCategorySchema = z.object({ id, commandId, name });
export const deleteCategorySchema = z.object({ id, commandId });

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type RenameCategoryInput = z.input<typeof renameCategorySchema>;
export type DeleteCategoryInput = z.input<typeof deleteCategorySchema>;
