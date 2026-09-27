"use client";

// Keeps this device ready to work offline while a user is signed in (FR-050, leaf 6.1):
// - refreshes the offline product catalog when the app opens, when the connection comes back,
//   and when the app returns to the foreground after a while;
// - asks the service worker to save the pages used offline, so they reload without a
//   connection even if the user never opened them on this device;
// - asks it to save every page opened through the app's own links as well. Those only fetch
//   in-app data, which can't be reused offline, and Serwist's own save-on-navigation missed them.
import { useSerwist } from "@serwist/turbopack/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { catalogSyncedAt, refreshCatalog } from "@/lib/offline/catalog";

/** Pages every signed-in user may need offline. Owner-only pages are saved only when visited. */
const OFFLINE_PAGES = ["/dashboard", "/checkout", "/sales", "/products"];
const STALE_AFTER_MS = 5 * 60 * 1000;

export function OfflineCatalogSync() {
  const { serwist } = useSerwist();
  const pathname = usePathname();

  useEffect(() => {
    let running = false;

    async function refresh(onlyIfStale: boolean) {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        if (onlyIfStale) {
          const syncedAt = await catalogSyncedAt();
          if (syncedAt && Date.now() - syncedAt.getTime() < STALE_AFTER_MS) return;
        }
        await refreshCatalog();
      } catch {
        // IndexedDB unavailable (e.g. private mode) or a bad reply: keep working online only.
      } finally {
        running = false;
      }
    }

    const onOnline = () => void refresh(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };

    void refresh(false);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!serwist || !navigator.onLine) return;
    void serwist.messageSW({ type: "CACHE_URLS", payload: { urlsToCache: OFFLINE_PAGES } });
  }, [serwist]);

  useEffect(() => {
    if (!serwist || !navigator.onLine) return;
    void serwist.messageSW({ type: "CACHE_URLS", payload: { urlsToCache: [pathname] } });
  }, [serwist, pathname]);

  return null;
}
