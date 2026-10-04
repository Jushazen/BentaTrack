// Pages the offline app draws from the device store (FR-049, FR-055; leaf 9.2). The service
// worker sends these to the offline app whenever the network is down, so they open offline even
// if never visited (one product, its edit form). Other pages (dashboard, checkout, sales,
// reports) are served from their saved copies until leaf 9.3.
// Pure, so the service worker can bundle it too.
import type { Capability } from "@/lib/permissions";

export type OfflineRoute =
  | { page: "products" }
  | { page: "product-new" }
  | { page: "product"; id: string }
  | { page: "product-edit"; id: string }
  | { page: "categories" }
  | { page: "suppliers" }
  | { page: "users" }
  | { page: "account" }
  | { page: "inventory-history" };

/** What each page needs, as the server page checks with requirePageCapability(). */
export const OFFLINE_ROUTE_CAPABILITY: Record<OfflineRoute["page"], Capability> = {
  products: "products.read",
  "product-new": "products.create",
  product: "products.read",
  "product-edit": "products.update",
  categories: "categories.manage",
  suppliers: "suppliers.manage",
  users: "users.manage",
  account: "account.password",
  "inventory-history": "inventory.history",
};

const FIXED: Record<string, OfflineRoute> = {
  "/products": { page: "products" },
  "/products/new": { page: "product-new" },
  "/categories": { page: "categories" },
  "/suppliers": { page: "suppliers" },
  "/users": { page: "users" },
  "/account": { page: "account" },
  "/inventory-history": { page: "inventory-history" },
};

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** The offline page for this address, or null if the offline app doesn't draw it. */
export function matchOfflineRoute(pathname: string): OfflineRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const fixed = FIXED[path];
  if (fixed) return fixed;
  const match = /^\/products\/([^/]+)(\/edit)?$/.exec(path);
  // Product photos live under /products/images/<file> and are files, not pages.
  if (!match || match[1] === "images") return null;
  const id = decode(match[1]);
  if (!id) return null;
  return match[2] ? { page: "product-edit", id } : { page: "product", id };
}
