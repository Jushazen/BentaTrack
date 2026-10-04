// The dashboard (FR-023–025, FR-023a; leaf 5.2), drawn by the server page online and by the
// offline app from the device store (leaf 9.3). The owner sees the catalogue totals, stock,
// products that need a cost, recent sales and best sellers; staff see only today's sales, low
// stock and recent sales. Times are Manila time.
import { ArrowRight, ChartColumn, PackagePlus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { StockStatusBadge } from "@/features/products/product-badges";
import { saleTimeFormat, WaitingBadge, WaitingNote } from "@/features/refunds/sales-list";
import { PAYMENT_LABEL } from "@/features/sales/schemas";
import { formatPeso } from "@/lib/money";
import type { Result } from "@/lib/result";
import type { Dashboard, OwnerDashboard, RecentSale } from "./dashboard";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-PH")} ${count === 1 ? one : many}`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface rounded-lg p-4">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="text-text mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-muted mt-1 text-sm">{note}</dd>}
    </div>
  );
}

function Panel({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="bg-surface space-y-2 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-text font-medium">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className={buttonClasses("ghost", "-mr-3 min-h-10 px-3 text-sm")}>
      <span>{children}</span>
      <ArrowRight aria-hidden className="size-4 shrink-0" />
    </Link>
  );
}

function TodayTotals({ dashboard }: { dashboard: Dashboard }) {
  const { today } = dashboard;
  return (
    <dl aria-label="Today's sales" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Today's sales"
        value={formatPeso(today.netSales)}
        note={today.refunds > 0 ? `${formatPeso(today.refunds)} refunded` : "After refunds"}
      />
      <Stat label="Sales made today" value={today.saleCount.toLocaleString("en-PH")} />
      <Stat label="Items sold today" value={today.itemsSold.toLocaleString("en-PH")} />
      <Stat
        label="Low or out of stock"
        value={dashboard.lowStock.count.toLocaleString("en-PH")}
        note={dashboard.lowStock.count === 1 ? "product" : "products"}
      />
    </dl>
  );
}

function StockTotals({ dashboard }: { dashboard: OwnerDashboard }) {
  return (
    <dl aria-label="Stock" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Total products" value={dashboard.totalProducts.toLocaleString("en-PH")} />
      <Stat label="Items in stock" value={dashboard.unitsInStock.toLocaleString("en-PH")} />
      <Stat label="Out of stock" value={dashboard.outOfStockCount.toLocaleString("en-PH")} />
      <Stat
        label="Needs cost"
        value={dashboard.needsCost.count.toLocaleString("en-PH")}
        note="Left out of profit until a purchase price is added"
      />
    </dl>
  );
}

function LowStockPanel({ dashboard }: { dashboard: Dashboard }) {
  const { count, items } = dashboard.lowStock;
  return (
    <Panel
      id="low-stock"
      title="Low stock"
      action={count > 0 && <PanelLink href="/products?stock=low">View all</PanelLink>}
    >
      {items.length === 0 ? (
        <p className="text-muted">Everything is well stocked.</p>
      ) : (
        <ul aria-label="Low stock" className="divide-border divide-y">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/products/${item.id}`}
                className="hover:bg-secondary -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5"
              >
                <span className="min-w-0">
                  <span className="text-text block font-medium break-words">{item.name}</span>
                  <span className="text-muted block text-sm">
                    {item.quantity} left · alert at {item.threshold}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  <StockStatusBadge status={item.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentSaleRow({ sale }: { sale: RecentSale }) {
  return (
    <li>
      <Link
        href={`/sales/${sale.id}`}
        aria-label={`Sale of ${formatPeso(sale.total)} on ${saleTimeFormat.format(sale.occurredAt)}`}
        className="hover:bg-secondary -mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-2.5"
      >
        <span className="min-w-0">
          <span className="text-text block">
            {plural(sale.itemCount, "item")} · {PAYMENT_LABEL[sale.paymentMethod]}
          </span>
          <span className="text-muted block text-sm">
            <time dateTime={sale.occurredAt.toISOString()}>
              {saleTimeFormat.format(sale.occurredAt)}
            </time>{" "}
            · By {sale.staffName}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="text-text block font-medium tabular-nums">{formatPeso(sale.total)}</span>
          {sale.pending && <WaitingBadge />}
        </span>
      </Link>
    </li>
  );
}

function RecentSalesPanel({ dashboard }: { dashboard: Dashboard }) {
  return (
    <Panel
      id="recent-sales"
      title="Recent sales"
      action={<PanelLink href="/sales">All sales</PanelLink>}
    >
      {dashboard.recentSales.length === 0 ? (
        <p className="text-muted">No sales yet.</p>
      ) : (
        <ul aria-label="Recent sales" className="divide-border divide-y">
          {dashboard.recentSales.map((sale) => (
            <RecentSaleRow key={sale.id} sale={sale} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NeedsCostPanel({ dashboard }: { dashboard: OwnerDashboard }) {
  const { count, items } = dashboard.needsCost;
  return (
    <Panel
      id="needs-cost"
      title="Needs cost"
      action={count > 0 && <PanelLink href="/products?cost=missing">View all</PanelLink>}
    >
      {items.length === 0 ? (
        <p className="text-muted">Every product has a purchase price.</p>
      ) : (
        <>
          <p className="text-muted text-sm">
            Added without a purchase price, so profit leaves them out.
          </p>
          <ul aria-label="Needs cost" className="divide-border divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/products/${item.id}/edit`}
                  className="hover:bg-secondary -mx-2 block rounded-md px-2 py-2.5"
                >
                  <span className="text-text block font-medium break-words">{item.name}</span>
                  <span className="text-muted block text-sm">{item.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function BestSellersPanel({ dashboard }: { dashboard: OwnerDashboard }) {
  const { title, items } = dashboard.bestSellers;
  return (
    <Panel
      id="best-sellers"
      title={`Best sellers, ${title}`}
      action={<PanelLink href="/reports?period=month">Monthly report</PanelLink>}
    >
      {items.length === 0 ? (
        <p className="text-muted">Nothing sold this month yet.</p>
      ) : (
        <ol aria-label="Best sellers" className="divide-border divide-y">
          {items.map((item, i) => (
            <li
              key={item.productId ?? `code:${item.code}`}
              className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-2 py-2.5"
            >
              <span className="text-muted tabular-nums">{i + 1}.</span>
              <span className="text-text min-w-0 font-medium break-words">{item.name}</span>
              <span className="text-right">
                <span className="text-text block tabular-nums">{item.units} sold</span>
                <span className="text-muted block text-sm tabular-nums">
                  {formatPeso(item.revenue)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function DashboardView({
  result,
  waitingToSync = 0,
}: {
  result: Result<Dashboard>;
  /** Offline only: sales and refunds included that haven't synced yet. */
  waitingToSync?: number;
}) {
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-text">Dashboard</h1>
        <p role="alert" className="text-danger mt-4">
          {result.error.message}
        </p>
      </div>
    );
  }
  const dashboard = result.data;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-text">Dashboard</h1>
          <p className="text-muted mt-1">{dashboard.today.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/checkout" className={buttonClasses("primary")}>
            <ShoppingCart aria-hidden className="size-4 shrink-0" />
            <span>New sale</span>
          </Link>
          {dashboard.kind === "owner" ? (
            <Link href="/reports" className={buttonClasses("secondary")}>
              <ChartColumn aria-hidden className="size-4 shrink-0" />
              <span>Sales reports</span>
            </Link>
          ) : (
            <Link href="/products/new" className={buttonClasses("secondary")}>
              <PackagePlus aria-hidden className="size-4 shrink-0" />
              <span>Add product</span>
            </Link>
          )}
        </div>
      </div>

      <WaitingNote count={waitingToSync} />
      <TodayTotals dashboard={dashboard} />
      {dashboard.kind === "owner" && <StockTotals dashboard={dashboard} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentSalesPanel dashboard={dashboard} />
        <LowStockPanel dashboard={dashboard} />
        {dashboard.kind === "owner" && (
          <>
            <BestSellersPanel dashboard={dashboard} />
            <NeedsCostPanel dashboard={dashboard} />
          </>
        )}
      </div>
    </div>
  );
}
