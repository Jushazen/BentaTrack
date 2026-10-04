/// <reference lib="webworker" />
// Service worker (§4.9, §5.3, FR-049, FR-050). Leaves 6.1 and 9.2. Bundled by
// src/app/serwist/[path]/route.ts and served at /serwist/sw.js. Precaches the build's static
// files and the offline app (/offline), keeps saved copies of the pages it can't draw, and keeps
// the signed-in user's session so the offline app knows whose pages to draw. The caching rules
// are in ./sw-rules.ts.
import { defaultCache, PAGES_CACHE_NAME } from "@serwist/turbopack/worker";
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import { parseSession, SESSION_CACHE, SESSION_URL } from "@/lib/offline/read/session";
import {
  appRuntimeCaching,
  isSessionChange,
  OFFLINE_APP_URL,
  pagesToSave,
  USER_CACHES,
} from "./sw-rules";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Counts every emptying of the user caches; a save that sees it change drops what it wrote. */
let generation = 0;

async function clearUserCaches(): Promise<void> {
  generation += 1;
  await Promise.all(USER_CACHES.map((name) => caches.delete(name)));
}

// Registered before Serwist's own listener so it answers these requests: the caches are emptied
// before the request goes out, so nothing the next user loads can land in them first.
self.addEventListener("fetch", (event) => {
  if (!isSessionChange(event.request, self.location.origin)) return;
  const request = event.request.clone();
  event.respondWith(
    (async () => {
      await clearUserCaches();
      const response = await fetch(request);
      // A save that started before the session changed may have written the previous user's
      // session or pages back meanwhile (leaf 9.7): empty the caches again now that it has.
      await clearUserCaches();
      return response;
    })(),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...appRuntimeCaching(), ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_APP_URL,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

/**
 * Saves who is signed in, and the pages their role may open that aren't saved yet. Runs whenever
 * the app asks for pages to be saved (on every page it opens online), so it is current from the
 * first page after signing in. If someone signs in or out while it runs, it removes what it
 * wrote: that belongs to the previous user (FR-032, leaf 9.7).
 */
async function saveSignedInUser(): Promise<void> {
  const started = generation;
  const stale = () => generation !== started;
  const response = await fetch(SESSION_URL, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok || stale()) return;
  const session = parseSession(await response.clone().json());
  const cache = await caches.open(SESSION_CACHE);
  if (!session) {
    await cache.delete(SESSION_URL);
    return;
  }
  await cache.put(SESSION_URL, response);
  if (stale()) {
    await cache.delete(SESSION_URL);
    return;
  }

  const pages = await caches.open(PAGES_CACHE_NAME.html);
  await Promise.all(
    pagesToSave(session.role).map(async (url) => {
      if (await pages.match(url, { ignoreVary: true })) return;
      // Fetched here rather than through Serwist, whose cache write finishes later, unchecked.
      const page = await fetch(url, { credentials: "same-origin" });
      if (!page.ok || page.redirected || stale()) return;
      await pages.put(url, page);
      if (stale()) await pages.delete(url, { ignoreVary: true });
    }),
  );
}

// Registered before Serwist's listeners, and answers every CACHE_URLS message itself: Serwist's
// own handler would save the listed pages with no check for a sign-out meanwhile. The pages it
// would save are the ones saveSignedInUser saves; the rest are drawn by the offline app.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type !== "CACHE_URLS") return;
  event.stopImmediatePropagation();
  event.waitUntil(saveSignedInUser().catch(() => undefined));
});

serwist.addEventListeners();
