// Sales list with search (FR-012). Server component: the search form is a plain GET form, so it
// works before JavaScript loads. Times are shown in Manila time.
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { PAYMENT_LABEL } from "@/features/sales/schemas";
import { formatPeso } from "@/lib/money";
import type { RefundState, SaleSummary, SalesPage } from "./queries";

// Same look as inputClasses in components/ui/field.tsx (a "use client" module; see product-list).
const inputClasses = "border-border bg-bg text-text w-full rounded-lg border px-3 py-2.5 text-base";

export const saleTimeFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export function RefundStateBadge({ state }: { state: RefundState }) {
  if (state === "NONE") return null;
  return state === "FULL" ? (
    <Badge tone="danger">Refunded</Badge>
  ) : (
    <Badge tone="warn">Partly refunded</Badge>
  );
}

function pageHref(filters: SalesPage["filters"], page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/sales?${query}` : "/sales";
}

function Filters({ filters }: { filters: SalesPage["filters"] }) {
  return (
    <form
      method="get"
      action="/sales"
      role="search"
      aria-label="Search sales"
      className="bg-surface grid gap-3 rounded-lg p-4 md:grid-cols-[1fr_auto_auto] md:items-end"
    >
      <div className="space-y-1.5">
        <label htmlFor="sales-q" className="text-text block text-sm font-medium">
          Product name, code, or customer
        </label>
        <input
          id="sales-q"
          name="q"
          type="search"
          defaultValue={filters.q ?? ""}
          className={inputClasses}
        />
      </div>
      <button type="submit" className={buttonClasses("secondary")}>
        <Search aria-hidden className="size-4 shrink-0" />
        <span>Search</span>
      </button>
      {filters.q && (
        <Link href="/sales" className={buttonClasses("ghost")}>
          <X aria-hidden className="size-4 shrink-0" />
          <span>Clear</span>
        </Link>
      )}
    </form>
  );
}

function SaleRow({ sale }: { sale: SaleSummary }) {
  const units = sale.itemCount === 1 ? "1 item" : `${sale.itemCount} items`;
  return (
    <li>
      <Link
        href={`/sales/${sale.id}`}
        aria-label={`Sale of ${formatPeso(sale.total)} on ${saleTimeFormat.format(sale.occurredAt)}`}
        className="hover:bg-secondary grid gap-x-4 gap-y-1 rounded-md p-3 md:grid-cols-[10rem_1fr_8rem_1fr] md:items-start"
      >
        <p className="text-muted text-sm">
          <time dateTime={sale.occurredAt.toISOString()}>
            {saleTimeFormat.format(sale.occurredAt)}
          </time>
        </p>
        <div className="min-w-0 space-y-1">
          <p className="text-text flex flex-wrap items-center gap-2">
            <span>
              {units} · {PAYMENT_LABEL[sale.paymentMethod]}
            </span>
            <RefundStateBadge state={sale.refundState} />
          </p>
          {sale.customerInfo && (
            <p className="text-muted text-sm break-words">{sale.customerInfo}</p>
          )}
        </div>
        <div className="md:text-right">
          <p className="text-text font-medium">{formatPeso(sale.total)}</p>
          {sale.refundedAmount > 0 && (
            <p className="text-muted text-sm">{formatPeso(sale.refundedAmount)} refunded</p>
          )}
        </div>
        <p className="text-muted text-sm md:text-right">By {sale.staffName}</p>
      </Link>
    </li>
  );
}

export function SalesList({ data }: { data: SalesPage }) {
  const { items, total, page, pageCount, filters } = data;
  return (
    <>
      <Filters filters={filters} />
      <section aria-labelledby="sales-list-title" className="bg-surface rounded-lg p-2 lg:p-3">
        <h2 id="sales-list-title" className="text-muted px-3 pt-2 pb-1 text-sm">
          {total === 1 ? "1 sale" : `${total.toLocaleString("en-PH")} sales`}
          {filters.q && " match this search"}, newest first
        </h2>
        {items.length === 0 ? (
          <p className="text-muted px-3 py-4">
            {filters.q ? "No sales match. Try another search." : "No sales yet."}
          </p>
        ) : (
          <ul aria-label="Sales" className="divide-border divide-y">
            {items.map((sale) => (
              <SaleRow key={sale.id} sale={sale} />
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
