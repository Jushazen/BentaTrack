"use client";

// Registers the service worker (leaf 6.1) for the whole site. Off under `next dev`, where
// caching would hide code changes; test offline with `npm run build && npm start`.
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

export function ServiceWorkerProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV === "development"}
      // Never reload on reconnect: it would throw away a cart being rung up.
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
