// Web app manifest (§2.5: a website that installs like an app). Leaf 6.1.
// Served at /manifest.webmanifest; Next adds the <link rel="manifest"> tag.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Estetika BentaTrack",
    short_name: "BentaTrack",
    description: "Inventory and sales for Estetika",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#7a4e3c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
