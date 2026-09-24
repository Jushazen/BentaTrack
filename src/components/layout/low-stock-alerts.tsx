"use client";

// Low-stock pop-ups (FR-007, FR-008). Stock-changing actions return `lowStockAlerts`
// (PLAN contract); the client passes them to showLowStockAlerts(). The shell also
// announces the current low-stock count once per session when the app opens.
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export type LowStockAlert = {
  productId: string;
  name: string;
  quantity: number;
  threshold: number;
};

function describe(alert: LowStockAlert): string {
  return alert.quantity <= 0
    ? `${alert.name} is now out of stock.`
    : `${alert.name} is low on stock: ${alert.quantity} left.`;
}

/** Shows one pop-up per product that just crossed into Low Stock or Out of Stock. */
export function showLowStockAlerts(
  alerts: readonly LowStockAlert[],
  openProduct?: (productId: string) => void,
) {
  for (const alert of alerts) {
    toast.warning(describe(alert), {
      id: `low-stock-${alert.productId}`,
      duration: 8000,
      action: openProduct
        ? { label: "View product", onClick: () => openProduct(alert.productId) }
        : undefined,
    });
  }
}

const SESSION_KEY = "bentatrack:low-stock-announced";

/** Announces low/out-of-stock products once per browser session (FR-007). */
export function LowStockOnOpen({ count }: { count: number }) {
  const router = useRouter();
  // Only the count when the app opens is announced. Later changes (after a sale refreshes the
  // layout) already come with their own per-product pop-ups (FR-008).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (count <= 0) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Storage blocked: announce anyway.
    }
    toast.warning(
      count === 1
        ? "1 product is low on stock or out of stock."
        : `${count} products are low on stock or out of stock.`,
      {
        id: "low-stock-summary",
        duration: 10000,
        action: { label: "View", onClick: () => router.push("/products?stock=low") },
      },
    );
  }, [count, router]);
  return null;
}
