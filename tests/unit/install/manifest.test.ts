import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import manifest from "@/app/manifest";

// The root layout loads Google fonts and the service worker, which only exist inside Next.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "font-inter" }),
  Gloock: () => ({ variable: "font-gloock" }),
}));
vi.mock("@/components/layout/providers", () => ({ Providers: () => null }));
vi.mock("@/components/offline/service-worker-provider", () => ({
  ServiceWorkerProvider: () => null,
}));

const { metadata, viewport } = await import("@/app/layout");

/** Width and height from a PNG file's IHDR header, after checking it really is a PNG. */
function pngSize(publicPath: string) {
  const bytes = readFileSync(join(process.cwd(), "public", publicPath));
  expect(bytes.subarray(1, 4).toString("ascii"), publicPath).toBe("PNG");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("install manifest and page metadata", () => {
  const m = manifest();

  test("[FR-061-MANIFEST] opens full-screen as its own app, starting inside its scope", () => {
    expect(m.display).toBe("standalone");
    expect(m.name).toBe("Estetika BentaTrack");
    // Home-screen labels cut off past about 12 characters.
    expect(m.short_name?.length).toBeLessThanOrEqual(12);
    expect(m.start_url?.startsWith(m.scope ?? "/")).toBe(true);
    expect(m.id).toBeTruthy();
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("[FR-061-MANIFEST] has 192px and 512px icons and a maskable icon, each a real PNG of its stated size", () => {
    const icons = m.icons ?? [];
    const purposes = (purpose: string) =>
      icons.filter((i) => (i.purpose ?? "any").split(" ").includes(purpose));
    expect(purposes("any").map((i) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(purposes("maskable").length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(icon.src), icon.src).toBe(icon.sizes);
    }
  });

  test("[FR-061-MANIFEST] iPhone gets a 180px home-screen icon, a title, and full-screen mode", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "BentaTrack" });
    const icons = metadata.icons as { apple?: string };
    expect(icons.apple).toBeTruthy();
    expect(pngSize(icons.apple!)).toBe("180x180");
  });

  test("[FR-061-MANIFEST] the browser bar colour follows light and dark themes", () => {
    const colours = viewport.themeColor as { media: string; color: string }[];
    expect(colours.map((c) => c.media)).toEqual([
      "(prefers-color-scheme: light)",
      "(prefers-color-scheme: dark)",
    ]);
  });
});
