import { describe, expect, test } from "vitest";
import { installMode, type InstallEnv } from "@/components/install/install-store";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ asks for desktop sites, so it looks like a Mac apart from its touch screen.
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  desktopFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

const env = (over: Partial<InstallEnv>): InstallEnv => ({
  standalone: false,
  canPrompt: false,
  userAgent: UA.android,
  platform: "Linux armv8l",
  maxTouchPoints: 5,
  ...over,
});

describe("install offer", () => {
  test("[FR-061] offers the browser's install prompt once the browser allows it", () => {
    expect(installMode(env({ canPrompt: true }))).toBe("prompt");
    expect(installMode(env({ canPrompt: false }))).toBe("hidden");
  });

  test("[FR-061] iPhone and iPad get Add to Home Screen steps, starting in Safari", () => {
    expect(installMode(env({ userAgent: UA.iphoneSafari, platform: "iPhone" }))).toBe("ios-safari");
    expect(installMode(env({ userAgent: UA.iphoneChrome, platform: "iPhone" }))).toBe("ios-other");
    expect(installMode(env({ userAgent: UA.ipadSafari, platform: "MacIntel" }))).toBe("ios-safari");
  });

  test("[FR-061] a Mac without a touch screen or a browser that cannot install gets nothing", () => {
    expect(
      installMode(env({ userAgent: UA.ipadSafari, platform: "MacIntel", maxTouchPoints: 0 })),
    ).toBe("hidden");
    expect(installMode(env({ userAgent: UA.desktopFirefox, platform: "Win32" }))).toBe("hidden");
  });

  test("[FR-061] nothing is offered once the app runs installed", () => {
    expect(installMode(env({ standalone: true, canPrompt: true }))).toBe("hidden");
    expect(
      installMode(env({ standalone: true, userAgent: UA.iphoneSafari, platform: "iPhone" })),
    ).toBe("hidden");
  });
});
