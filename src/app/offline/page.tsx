// Shown by the service worker for a page this device has never opened while online (§4.9).
// Leaf 6.1. Static and public, so it is precached at install and needs no server.
import { LayoutDashboard, ShoppingCart, WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { buttonClasses } from "@/components/ui/button";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Offline · BentaTrack" };

export default function OfflinePage() {
  return (
    <main className="bg-surface flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-bg max-w-md rounded-lg border p-8 text-center">
        <WifiOff aria-hidden className="text-muted mx-auto size-10" strokeWidth={1.5} />
        <h1 className="font-display text-text mt-4 text-2xl">You are offline</h1>
        <p className="text-muted mt-2">
          This page hasn&apos;t been saved on this device yet. Checkout and the pages you opened
          while online still work until the connection is back.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {/* Plain links: a full page load lets the service worker answer from its saved copy. */}
          <a href="/checkout" className={buttonClasses("primary")}>
            <ShoppingCart aria-hidden className="size-4" />
            <span>Open checkout</span>
          </a>
          <a href="/dashboard" className={buttonClasses("secondary")}>
            <LayoutDashboard aria-hidden className="size-4" />
            <span>Go to dashboard</span>
          </a>
        </div>
        <RetryButton />
      </div>
    </main>
  );
}
