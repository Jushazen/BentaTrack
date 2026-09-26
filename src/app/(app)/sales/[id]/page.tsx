// One sale (FR-012) with its refunds and the refund form (FR-039, FR-040). Leaf 4.2.
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { getSale } from "@/features/refunds/queries";
import { RefundForm } from "@/features/refunds/refund-form";
import { RefundStateBadge, saleTimeFormat } from "@/features/refunds/sales-list";
import { PAYMENT_LABEL } from "@/features/sales/schemas";
import { requirePageCapability } from "@/lib/auth";
import { formatPeso } from "@/lib/money";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Sale · BentaTrack" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-border flex flex-wrap justify-between gap-x-4 gap-y-1 border-b py-2.5 last:border-b-0">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="text-text text-right">{children}</dd>
    </div>
  );
}

export default async function SaleDetailPage({ params }: PageProps<"/sales/[id]">) {
  const user = await requirePageCapability("sales.read");
  const { id } = await params;
  const result = await getSale(id);
  if (!result.ok) notFound();
  const sale = result.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/sales" className={buttonClasses("ghost", "-ml-4")}>
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        <span>All sales</span>
      </Link>

      <div>
        <h1 className="text-text">Sale of {formatPeso(sale.total)}</h1>
        <p className="text-muted mt-1 flex flex-wrap items-center gap-2">
          <time dateTime={sale.occurredAt.toISOString()}>
            {saleTimeFormat.format(sale.occurredAt)}
          </time>
          <span>· By {sale.staffName}</span>
          <RefundStateBadge state={sale.refundState} />
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_20rem] md:items-start">
        <section aria-labelledby="items-title" className="bg-surface rounded-lg p-4">
          <h2 id="items-title" className="text-text text-base font-semibold">
            Items
          </h2>
          <ul aria-label="Items sold" className="divide-border mt-2 divide-y">
            {sale.items.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0">
                  {item.productId ? (
                    <Link
                      href={`/products/${item.productId}`}
                      className="text-text font-medium hover:underline"
                    >
                      {item.productName}
                    </Link>
                  ) : (
                    <span className="text-text font-medium">{item.productName}</span>
                  )}
                  <p className="text-muted text-sm">
                    {item.productCode} · {item.quantity} × {formatPeso(item.unitPrice)}
                    {item.refundedQuantity > 0 && ` · ${item.refundedQuantity} refunded`}
                  </p>
                </div>
                <p className="text-text">{formatPeso(item.quantity * item.unitPrice)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="summary-title" className="bg-surface rounded-lg p-4">
          <h2 id="summary-title" className="text-text text-base font-semibold">
            Payment
          </h2>
          <dl className="mt-2">
            <Row label="Subtotal">{formatPeso(sale.subtotal)}</Row>
            {sale.discountAmount > 0 && (
              <Row label="Discount">-{formatPeso(sale.discountAmount)}</Row>
            )}
            <Row label="Total">
              <strong>{formatPeso(sale.total)}</strong>
            </Row>
            <Row label="Paid by">{PAYMENT_LABEL[sale.paymentMethod]}</Row>
            {sale.refundedAmount > 0 && (
              <Row label="Refunded">-{formatPeso(sale.refundedAmount)}</Row>
            )}
            {sale.customerInfo && <Row label="Customer">{sale.customerInfo}</Row>}
          </dl>
        </section>
      </div>

      {sale.refunds.length > 0 && (
        <section aria-labelledby="refunds-title" className="bg-surface rounded-lg p-4">
          <h2 id="refunds-title" className="text-text text-base font-semibold">
            Refunds
          </h2>
          <ul aria-label="Refunds given" className="divide-border mt-2 divide-y">
            {sale.refunds.map((refund) => (
              <li key={refund.id} className="space-y-1 py-2.5">
                <p className="flex flex-wrap justify-between gap-x-4">
                  <span className="text-muted text-sm">
                    <time dateTime={refund.occurredAt.toISOString()}>
                      {saleTimeFormat.format(refund.occurredAt)}
                    </time>{" "}
                    · By {refund.userName}
                  </span>
                  <strong className="text-text">{formatPeso(refund.amount)}</strong>
                </p>
                <p className="text-text text-sm">
                  {refund.items.map((item) => `${item.quantity} × ${item.productName}`).join(", ")}
                </p>
                {refund.note && <p className="text-muted text-sm break-words">{refund.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {can(user.role, "refunds.create") && (
        <RefundForm
          saleId={sale.id}
          subtotal={sale.subtotal}
          total={sale.total}
          items={sale.items}
        />
      )}
    </div>
  );
}
