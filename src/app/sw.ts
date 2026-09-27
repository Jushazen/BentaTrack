/// <reference lib="webworker" />
// Service worker (§4.9, §5.3, FR-050). Leaf 6.1. Bundled by src/app/serwist/[path]/route.ts and
// served at /serwist/sw.js. Precaches the build's static files and the /offline page, keeps a
// network-first copy of every page visited, and shows /offline for pages it never saw.
import { defaultCache, PAGES_CACHE_NAME } from "@serwist/turbopack/worker";
import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

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
    // Whole pages: opened in the browser, or saved ahead by a CACHE_URLS message (a plain GET).
    // Both land in one cache, looked up by address alone. Next.js marks pages `Vary: RSC,
    // Next-Router-State-Tree, …, Accept-Encoding`; honouring that, Safari never matched a page
    // saved ahead with the request it makes when the page is opened, and showed /offline for
    // every page. Only whole pages are kept here (RSC payloads have their own caches), so
    // ignoring Vary can't serve the wrong kind of reply.
    {
      matcher: ({ request, sameOrigin, url: { pathname } }) =>
        sameOrigin &&
        request.method === "GET" &&
        request.headers.get("RSC") !== "1" &&
        !pathname.startsWith("/api/") &&
        !pathname.startsWith("/_next/") &&
        // Page addresses have no file extension; icons, the manifest, and scripts do.
        !/\.[a-z0-9]+$/i.test(pathname),
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE_NAME.html,
        matchOptions: { ignoreVary: true },
        plugins: [
          // A shop may stay offline for days; a page is re-saved whenever it's opened online.
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 }),
        ],
      }),
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
