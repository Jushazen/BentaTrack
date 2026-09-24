"use server";

// Server actions for client components: live product search and exact barcode/code lookup
// (FR-026–028). Leaf 3.5. Thin wrappers so the search box and scanners can call the queries.
import type { Result } from "@/lib/result";
import { lookupProduct, searchProducts, type SearchHit } from "./queries";

export async function searchProductsAction(query: string): Promise<Result<SearchHit[]>> {
  return searchProducts(query);
}

export async function lookupProductAction(code: string): Promise<Result<SearchHit | null>> {
  return lookupProduct(code);
}
