// The service worker's caching rules (§4.9, §5.3, FR-049, FR-050). Leaves 6.1 and 9.2. Kept apart
// from ./sw.ts so they can be unit-tested without a service worker.
// - Pages drawn by the offline app (products, one product and its edit form, categories,
//   suppliers, users, my account, inventory history) are never saved: offline they open in the
//   offline app, which reads the device store, so they work even if never visited.
// - Other pages are saved whenever they are opened online and kept with no age limit and no
//   entry cap, so a shop that stays offline for days or weeks still has them (C96).
import { PAGES_CACHE_NAME } from "@serwist/turbopack/worker";
import { NetworkFirst, NetworkOnly, type RuntimeCaching } from "serwist";
import type { Role } from "@/generated/prisma/enums";
import { matchOfflineRoute } from "@/lib/offline/read/routes";
import { SESSION_CACHE } from "@/lib/offline/read/session";
import { can, capabilityForPath } from "@/lib/permissions";

/** The offline app: precached at install, shown for any page the network can't deliver. */
export const OFFLINE_APP_URL = "/offline";

/**
 * Caches that hold one user's pages, API replies, or session. Emptied whenever someone signs in
 * or out, so a different user on the same device never sees them offline (FR-032).
 */
export const USER_CACHES = [
  PAGES_CACHE_NAME.html,
  PAGES_CACHE_NAME.rsc,
  PAGES_CACHE_NAME.rscPrefetch,
  "others",
  "apis",
  SESSION_CACHE,
];

/** Pages outside the offline app that each user keeps saved, if their role may open them. */
export const SAVED_PAGES = ["/dashboard", "/checkout", "/sales", "/reports"] as const;

export function pagesToSave(role: Role): string[] {
  return SAVED_PAGES.filter((path) => {
    const capability = capabilityForPath(path);
    return capability === null || can(role, capability);
  });
}

/** Sign-in and sign-out requests (NextAuth v4 credentials provider). */
export function isSessionChange(request: Request, origin: string): boolean {
  if (request.method !== "POST") return false;
  const url = new URL(request.url);
  return (
    url.origin === origin &&
    (url.pathname === "/api/auth/signout" || url.pathname.startsWith("/api/auth/callback/"))
  );
}

/** A page address: not the API, not Next's files, and no file extension (icons, scripts). */
function isPagePath(pathname: string): boolean {
  return (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !/\.[a-z0-9]+$/i.test(pathname)
  );
}

/** True for pages (and their in-app data requests) that the offline app draws. */
export function isOfflineAppPage(pathname: string): boolean {
  return isPagePath(pathname) && matchOfflineRoute(pathname) !== null;
}

/** The app's own rules, checked before Serwist's defaults. */
export function appRuntimeCaching(): RuntimeCaching[] {
  return [
    // The device snapshot must always be fresh, and sync must never be answered from a cache.
    {
      matcher: ({ sameOrigin, url }) =>
        sameOrigin && (url.pathname === "/api/catalog" || url.pathname.startsWith("/api/sync")),
      handler: new NetworkOnly(),
    },
    // Offline-app pages, whole or as in-app data: straight to the network. With no connection a
    // whole page gets the offline app (the fallback below), and an in-app link's data request
    // fails, so Next.js loads the whole page, which the offline app then draws.
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && request.method === "GET" && isOfflineAppPage(url.pathname),
      handler: new NetworkOnly(),
    },
    // Other whole pages: opened in the browser, or saved ahead by a CACHE_URLS message (a plain
    // GET). Both land in one cache, looked up by address alone. Next.js marks pages `Vary: RSC,
    // Next-Router-State-Tree, …, Accept-Encoding`; honouring that, Safari never matched a page
    // saved ahead with the request it makes when the page is opened, and showed /offline for
    // every page. Only whole pages are kept here (RSC payloads have their own caches), so
    // ignoring Vary can't serve the wrong kind of reply. No expiration: a page is re-saved
    // whenever it's opened online, and there are only a handful of them.
    {
      matcher: ({ request, sameOrigin, url: { pathname } }) =>
        sameOrigin &&
        request.method === "GET" &&
        request.headers.get("RSC") !== "1" &&
        isPagePath(pathname),
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE_NAME.html,
        matchOptions: { ignoreVary: true },
      }),
    },
  ];
}
