// Server-side reads: product search and barcode lookup (FR-026–028; §5.1 / D4: under 500 ms for
// 5,000 products). Leaf 3.5. Results never include purchase prices or suppliers, so staff can use
// them (FR-032).
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, type Result } from "@/lib/result";
import { stockStatus, type StockStatus } from "@/lib/stock-status";

export const SEARCH_LIMIT = 20;
export const MAX_QUERY_LENGTH = 100;

export type SearchHit = {
  id: string;
  name: string;
  code: string;
  barcode: string | null;
  brand: string | null;
  categoryName: string;
  sellingPrice: number;
  stockQuantity: number;
  status: StockStatus;
  imageUrl: string | null;
};

type Row = Omit<SearchHit, "status"> & { lowStockThreshold: number };

function toHit({ lowStockThreshold, ...row }: Row): SearchHit {
  return { ...row, status: stockStatus(row.stockQuantity, lowStockThreshold) };
}

function normalize(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, MAX_QUERY_LENGTH) : "";
}

/** Escapes LIKE wildcards so "50%" or "a_b" match literally. */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/**
 * Products whose name or code contains the query, or whose barcode equals it. Best matches
 * first: exact barcode or code, then code prefix, then name prefix, then the rest by name.
 */
export async function searchProducts(rawQuery: unknown): Promise<Result<SearchHit[]>> {
  const auth = await requireCapability("search");
  if (!auth.ok) return auth;
  const q = normalize(rawQuery);
  if (!q) return ok([]);

  const contains = `%${likeLiteral(q)}%`;
  const prefix = `${likeLiteral(q)}%`;
  const rows = await db.$queryRaw<Row[]>`
    select p.id, p.name, p.code, p.barcode, p.brand, c.name as "categoryName",
           p."sellingPrice", p."stockQuantity", p."lowStockThreshold", p."imageUrl"
    from "Product" p
    join "Category" c on c.id = p."categoryId"
    where p.name ilike ${contains} or p.code ilike ${contains} or lower(p.barcode) = lower(${q})
    order by
      case
        when lower(p.barcode) = lower(${q}) or lower(p.code) = lower(${q}) then 0
        when p.code ilike ${prefix} then 1
        when p.name ilike ${prefix} then 2
        else 3
      end,
      p.name, p.code
    limit ${SEARCH_LIMIT}`;
  return ok(rows.map(toHit));
}

/**
 * Exact lookup for a scanned or typed code (FR-028): the product with this barcode, else the
 * one with this product code. Null when nothing matches.
 */
export async function lookupProduct(rawCode: unknown): Promise<Result<SearchHit | null>> {
  const auth = await requireCapability("search");
  if (!auth.ok) return auth;
  const code = normalize(rawCode);
  if (!code) return ok(null);

  const rows = await db.$queryRaw<Row[]>`
    select p.id, p.name, p.code, p.barcode, p.brand, c.name as "categoryName",
           p."sellingPrice", p."stockQuantity", p."lowStockThreshold", p."imageUrl"
    from "Product" p
    join "Category" c on c.id = p."categoryId"
    where lower(p.barcode) = lower(${code}) or lower(p.code) = lower(${code})
    order by case when lower(p.barcode) = lower(${code}) then 0 else 1 end
    limit 1`;
  return ok(rows[0] ? toHit(rows[0]) : null);
}
