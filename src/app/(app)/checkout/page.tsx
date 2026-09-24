// Checkout (FR-013–019, Figure 1). Leaf 4.1.
import type { Metadata } from "next";
import { CheckoutForm } from "@/features/sales/checkout-form";
import { requirePageCapability } from "@/lib/auth";

export const metadata: Metadata = { title: "Checkout · BentaTrack" };

export default async function CheckoutPage() {
  await requirePageCapability("sales.create");
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-text">Checkout</h1>
        <p className="text-muted mt-1">Add the items, choose how the customer pays, and save.</p>
      </div>
      <CheckoutForm />
    </div>
  );
}
