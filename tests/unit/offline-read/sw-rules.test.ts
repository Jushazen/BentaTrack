// The service worker's caching rules (leaf 9.2): saved pages never expire and are never pushed
// out, and the offline app's pages always go to the network so offline they open in the offline
// app instead of a stale copy.
import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Strategy,
  type RuntimeCaching,
} from "serwist";
import { expect, test } from "vitest";
import {
  appRuntimeCaching,
  isOfflineAppPage,
  isSessionChange,
  pagesToSave,
  USER_CACHES,
} from "@/app/sw-rules";
import { matchOfflineRoute } from "@/lib/offline/read/routes";
import { SESSION_CACHE } from "@/lib/offline/read/session";

const ORIGIN = "https://shop.test";

/** The first rule that takes this request, as Serwist picks it. */
function ruleFor(path: string, headers: Record<string, string> = {}): RuntimeCaching | undefined {
  const url = new URL(path, ORIGIN);
  const request = new Request(url, { headers });
  return appRuntimeCaching().find(({ matcher }) =>
    typeof matcher === "function"
      ? matcher({ url, request, sameOrigin: true, event: {} as ExtendableEvent })
      : false,
  );
}

const PAGES = ["/checkout", "/login"];

test("[SW-NO-EXPIRY] saved pages have no age limit and no entry cap", () => {
  for (const path of PAGES) {
    const handler = ruleFor(path)?.handler;
    expect(handler, path).toBeInstanceOf(NetworkFirst);
    const strategy = handler as NetworkFirst;
    expect(strategy.cacheName).toBe("pages");
    expect(strategy.plugins.some((plugin) => plugin instanceof ExpirationPlugin)).toBe(false);
  }
  // No rule of the app's own expires anything.
  for (const { handler } of appRuntimeCaching()) {
    const plugins = handler instanceof Strategy ? handler.plugins : [];
    expect(plugins.some((plugin) => plugin instanceof ExpirationPlugin)).toBe(false);
  }
});

test("[SW-NO-EXPIRY] offline-app pages are never answered from a saved copy", () => {
  const offlineApp = [
    "/products",
    "/products/new",
    "/products/cmabc123",
    "/products/cmabc123/edit",
    "/categories",
    "/suppliers",
    "/users",
    "/account",
    "/inventory-history",
    "/inventory-history?product=p1",
    "/dashboard",
    "/sales",
    "/sales/abc",
    "/sales?q=tote",
    "/reports",
    "/reports?period=week",
  ];
  for (const path of offlineApp) {
    expect(ruleFor(path)?.handler, path).toBeInstanceOf(NetworkOnly);
    // In-app link data too, so Next.js falls back to loading the whole page.
    expect(ruleFor(path, { RSC: "1" })?.handler, `${path} (RSC)`).toBeInstanceOf(NetworkOnly);
  }
  // Product photos are files, not pages; Serwist's defaults handle them.
  expect(isOfflineAppPage("/products/images/a1.jpg")).toBe(false);
  expect(isOfflineAppPage("/products/images")).toBe(false);
  // Sync and the device snapshot are never cached either.
  expect(ruleFor("/api/catalog")?.handler).toBeInstanceOf(NetworkOnly);
  expect(ruleFor("/api/sync")?.handler).toBeInstanceOf(NetworkOnly);
});

test("[SW-NO-EXPIRY] the offline app knows every page it draws, and only those", () => {
  expect(matchOfflineRoute("/products")).toEqual({ page: "products" });
  expect(matchOfflineRoute("/products/")).toEqual({ page: "products" });
  expect(matchOfflineRoute("/products/new")).toEqual({ page: "product-new" });
  expect(matchOfflineRoute("/products/a%20b")).toEqual({ page: "product", id: "a b" });
  expect(matchOfflineRoute("/products/p1/edit")).toEqual({ page: "product-edit", id: "p1" });
  expect(matchOfflineRoute("/products/%E0%A4%A")).toBeNull();
  expect(matchOfflineRoute("/products/p1/other")).toBeNull();
  expect(matchOfflineRoute("/inventory-history")).toEqual({ page: "inventory-history" });
  expect(matchOfflineRoute("/dashboard")).toEqual({ page: "dashboard" });
  expect(matchOfflineRoute("/sales")).toEqual({ page: "sales" });
  expect(matchOfflineRoute("/sales/s1")).toEqual({ page: "sale", id: "s1" });
  expect(matchOfflineRoute("/reports")).toEqual({ page: "reports" });
  for (const path of ["/checkout", "/sales/s1/other", "/offline", "/login"]) {
    expect(matchOfflineRoute(path), path).toBeNull();
  }
});

test("[SW-NO-EXPIRY] each role keeps the other pages it may open saved, and the session is wiped at sign-in and sign-out", () => {
  expect(pagesToSave("OWNER")).toEqual(["/checkout"]);
  expect(pagesToSave("STAFF")).toEqual(["/checkout"]);
  expect(USER_CACHES).toContain(SESSION_CACHE);
  expect(USER_CACHES).toContain("pages");

  const post = (path: string) => new Request(new URL(path, ORIGIN), { method: "POST" });
  expect(isSessionChange(post("/api/auth/callback/credentials"), ORIGIN)).toBe(true);
  expect(isSessionChange(post("/api/auth/signout"), ORIGIN)).toBe(true);
  expect(isSessionChange(new Request(new URL("/api/auth/signout", ORIGIN)), ORIGIN)).toBe(false);
  expect(isSessionChange(post("/api/sync"), ORIGIN)).toBe(false);
});
