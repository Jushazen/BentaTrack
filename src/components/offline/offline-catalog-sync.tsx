"use client";

// Keeps this device ready to work offline while a user is signed in (FR-050, FR-055; leaves
// 6.1 and 9.1):
// - asks the browser to keep the device data even after days without use;
// - refreshes the device's copy of everything the user may see when the app opens, when the
//   connection comes back, and when the app returns to the foreground after a while;
// - asks the service worker to save the pages used offline, so they reload without a
//   connection even if the user never opened them on this device;
// - asks it to save every page opened through the app's own links as well. Those only fetch
//   in-app data, which can't be reused offline, and Serwist's own save-on-navigation missed them.
//   Pages the offline app draws from the device store are never saved (leaf 9.2), so they aren't
//   asked for. Each request also has the worker save who is signed in (src/app/sw.ts).
import { useSerwist } from "@serwist/turbopack/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  catalogSyncedAt,
  requestPersistentStorage,
  syncDeviceData,
} from "@/lib/offline/catalog";
import { matchOfflineRoute } from "@/lib/offline/read/routes";

/** Pages every signed-in user may need offline; the worker adds the owner's (src/app/sw-rules.ts). */
const OFFLINE_PAGES = ["/dashboard", "/checkout", "/sales"];
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
        await syncDeviceData();
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

    void requestPersistentStorage();
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
    if (!serwist || !navigator.onLine || matchOfflineRoute(pathname)) return;
    void serwist.messageSW({ type: "CACHE_URLS", payload: { urlsToCache: [pathname] } });
  }, [serwist, pathname]);

  return null;
}
