// Categories (owner only; FR-043). Leaf 3.3. The page itself is CategoriesView, which the offline
// app also draws (leaf 9.2).
import type { Metadata } from "next";
import { CategoriesView } from "@/features/categories/categories-view";
import { listCategories } from "@/features/categories/queries";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Categories · BentaTrack" };

export default async function CategoriesPage() {
  await requirePageCapability("categories.manage");
  return <CategoriesView categories={await listCategories()} />;
}
