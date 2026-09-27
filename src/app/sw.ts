/// <reference lib="webworker" />
// Service worker (§4.9, §5.3, FR-050). Leaf 6.1. Bundled by src/app/serwist/[path]/route.ts and
// served at /serwist/sw.js. Precaches the build's static files and the /offline page, keeps a
// network-first copy of every page visited, and shows /offline for pages it never saw.
import { defaultCache, PAGES_CACHE_NAME } from "@serwist/turbopack/worker";
import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Runtime caches that hold one user's pages or API replies. Emptied whenever someone signs in
 * or out, so a different user on the same device never sees them offline (FR-032).
 */
const USER_CACHES = [
  PAGES_CACHE_NAME.html,
  PAGES_CACHE_NAME.rsc,
  PAGES_CACHE_NAME.rscPrefetch,
  "others",
  "apis",
];

/** Sign-in and sign-out requests (NextAuth v4 credentials provider). */
function isSessionChange(request: Request): boolean {
  if (request.method !== "POST") return false;
  const url = new URL(request.url);
  return (
    url.origin === self.location.origin &&
    (url.pathname === "/api/auth/signout" || url.pathname.startsWith("/api/auth/callback/"))
  );
}

async function clearUserCaches(): Promise<void> {
  await Promise.all(USER_CACHES.map((name) => caches.delete(name)));
}

// Registered before Serwist's own listener so it answers these requests: the caches are emptied
// before the request goes out, so nothing the next user loads can land in them first.
self.addEventListener("fetch", (event) => {
  if (!isSessionChange(event.request)) return;
  const request = event.request.clone();
  event.respondWith(
    (async () => {
      await clearUserCaches();
      return fetch(request);
    })(),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // The offline catalog snapshot must always be fresh, and sync must never be answered from
    // a cache.
    {
      matcher: ({ sameOrigin, url }) =>
        sameOrigin && (url.pathname === "/api/catalog" || url.pathname.startsWith("/api/sync")),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
