// Inventory history list with filters (FR-010–012). Server component: the filter form is a plain
// GET form, so it works before JavaScript loads. Times are shown in Manila time.
import type { InventoryChangeType } from "@/generated/prisma/client";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import type { HistoryEntry, HistoryPage } from "./queries";
import { INVENTORY_CHANGE_TYPES } from "./schemas";

// Same look as inputClasses in components/ui/field.tsx (a "use client" module; see product-list).
const inputClasses = "border-border bg-bg text-text w-full rounded-lg border px-3 py-2.5 text-base";

export const CHANGE_TYPE_LABEL: Record<InventoryChangeType, string> = {
  SALE: "Sale",
  RESTOCK: "Restock",
  EDIT: "Edit",
  REFUND: "Refund",
  REMOVAL: "Removal",
};

const CHANGE_TYPE_TONE: Record<InventoryChangeType, BadgeTone> = {
  SALE: "neutral",
  RESTOCK: "ok",
  EDIT: "neutral",
  REFUND: "warn",
  REMOVAL: "danger",
};

const timeFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function pageHref(filters: HistoryPage["filters"], page: number): string {
  const params = new URLSearchParams();
  if (filters.product) params.set("product", filters.product);
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/inventory-history?${query}` : "/inventory-history";
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function Filters({ data }: { data: HistoryPage }) {
  const { filters, productLabel } = data;
  const label = "text-text block text-sm font-medium";
  return (
    <form
      method="get"
      action="/inventory-history"
      role="search"
      aria-label="Filter inventory history"
      className="bg-surface grid gap-3 rounded-lg p-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
    >
      {filters.product && <input type="hidden" name="product" value={filters.product} />}
      {filters.product && (
        <p className="text-text flex flex-wrap items-center gap-2 md:col-span-3">
          <span>
            Showing only{" "}
            <strong>
              {productLabel ? `${productLabel.name} (${productLabel.code})` : "one product"}
            </strong>
          </span>
          <Link
            href={pageHref({ ...filters, product: undefined }, 1)}
            className={buttonClasses("ghost")}
          >
            <X aria-hidden className="size-4 shrink-0" />
            <span>Show all products</span>
          </Link>
        </p>
      )}
      <div className="space-y-1.5">
        <label htmlFor="history-q" className={label}>
          Product name or code
        </label>
        <input
          id="history-q"
          name="q"
          type="search"
          defaultValue={filters.q ?? ""}
          className={inputClasses}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="history-type" className={label}>
          Change type
        </label>
        <select
          id="history-type"
          name="type"
          defaultValue={filters.type ?? ""}
          className={inputClasses}
        >
          <option value="">All changes</option>
          {INVENTORY_CHANGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {CHANGE_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={buttonClasses("secondary")}>
        <Search aria-hidden className="size-4 shrink-0" />
        <span>Apply filters</span>
      </button>
    </form>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const product = (
    <>
      <span className="text-text font-medium">{entry.productName}</span>{" "}
      <span className="text-muted text-sm">{entry.productCode}</span>
    </>
  );
  return (
    <li className="grid gap-x-4 gap-y-1 p-3 md:grid-cols-[10rem_2fr_6rem_6rem_1fr] md:items-start">
      <p className="text-muted text-sm">
        <time dateTime={entry.occurredAt.toISOString()}>{timeFormat.format(entry.occurredAt)}</time>
      </p>
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={CHANGE_TYPE_TONE[entry.type]}>{CHANGE_TYPE_LABEL[entry.type]}</Badge>
          {entry.productId ? (
            <Link href={`/products/${entry.productId}`} className="hover:underline">
              {product}
            </Link>
          ) : (
            <span>{product}</span>
          )}
        </p>
        {entry.note && <p className="text-muted text-sm break-words">{entry.note}</p>}
      </div>
      <p className="text-text text-sm md:text-right md:text-base">
        <span className="sr-only">Change: </span>
        <span className="md:hidden">Change </span>
        {signed(entry.quantityChange)}
      </p>
      <p className="text-muted text-sm md:text-right">{entry.stockAfter} in stock after</p>
      <p className="text-muted text-sm md:text-right">By {entry.userName}</p>
    </li>
  );
}

export function HistoryList({ data }: { data: HistoryPage }) {
  const { items, total, page, pageCount, filters } = data;
  const filtered = Boolean(filters.product || filters.q || filters.type);
  return (
    <>
      <Filters data={data} />
      <section aria-labelledby="history-list-title" className="bg-surface rounded-lg p-2 lg:p-3">
        <h2 id="history-list-title" className="text-muted px-3 pt-2 pb-1 text-sm">
          {total === 1 ? "1 change" : `${total.toLocaleString("en-PH")} changes`}
          {filtered && " match these filters"}, newest first
        </h2>
        {items.length === 0 ? (
          <p className="text-muted px-3 py-4">
            {filtered ? "No changes match. Try other filters." : "No inventory changes yet."}
          </p>
        ) : (
          <ul aria-label="Inventory changes" className="divide-border divide-y">
            {items.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
      {pageCount > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2">
          {page > 1 ? (
            <Link href={pageHref(filters, page - 1)} className={buttonClasses("secondary")}>
              <ChevronLeft aria-hidden className="size-4 shrink-0" />
              <span>Previous</span>
            </Link>
          ) : (
            <span />
          )}
          <p className="text-muted text-sm">
            Page {page} of {pageCount}
          </p>
          {page < pageCount ? (
            <Link href={pageHref(filters, page + 1)} className={buttonClasses("secondary")}>
              <span>Next</span>
              <ChevronRight aria-hidden className="size-4 shrink-0" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
