// Server-side reads: Owner-managed categories (FR-043). Leaf 3.3.
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, type Result } from "@/lib/result";

export type CategoryOption = { id: string; name: string };
export type CategoryRow = CategoryOption & { productCount: number };

/** Owner's category screen: every category with how many products use it. */
export async function listCategories(): Promise<Result<CategoryRow[]>> {
  const auth = await requireCapability("categories.manage");
  if (!auth.ok) return auth;
  const rows = await db.category.findMany({
    select: { id: true, name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
  return ok(rows.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products })));
}

/** Category names for product forms and filters. Staff may read these (categories.read). */
export async function listCategoryOptions(): Promise<Result<CategoryOption[]>> {
  const auth = await requireCapability("categories.read");
  if (!auth.ok) return auth;
  return ok(
    await db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  );
}
