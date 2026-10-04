// The plain offline notice (§3.1). Since leaf 9.2 it shows only when the offline app can't draw a
// page: before the signed-in user's first sync on this device, after signing out, or for a page
// that isn't saved here.
import { LayoutDashboard, ShoppingCart, WifiOff } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { RetryButton } from "./retry-button";

export function OfflineNotice() {
  return (
    <main className="bg-surface flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-bg max-w-md rounded-lg border p-8 text-center">
        <WifiOff aria-hidden className="text-muted mx-auto size-10" strokeWidth={1.5} />
        <h1 className="font-display text-text mt-4 text-2xl">You are offline</h1>
        <p className="text-muted mt-2">
          This page isn&apos;t saved on this device yet. Once you have logged in here while online
          and your data has finished saving, every page opens without a connection.
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
