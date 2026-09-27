// Builds and serves the service worker at /serwist/sw.js (plus its source map). Leaf 6.1.
// @serwist/turbopack bundles src/app/sw.ts with esbuild at build time and injects the list of
// static files to precache, since Turbopack has no plugin hook for it.
import { createSerwistRoute } from "@serwist/turbopack";
import { randomUUID } from "node:crypto";

// A new revision each build, so installed devices fetch the offline page again after a deploy.
const revision = randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: "src/app/sw.ts",
    additionalPrecacheEntries: [{ url: "/offline", revision }],
    // The native esbuild binary is already installed (a dev dependency); esbuild-wasm is not.
    useNativeEsbuild: true,
  },
);
