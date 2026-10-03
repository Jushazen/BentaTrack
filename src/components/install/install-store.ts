// Install offer state (FR-061). Chrome and Edge fire `beforeinstallprompt` once per page load,
// often before the signed-in shell has loaded, so the event is caught here at module load and
// kept until a button asks for it. iPhone and iPad never fire it: Apple only allows installing
// through Safari's Share → Add to Home Screen, so those devices get written steps instead.
import { EARLY_INSTALL_KEY } from "./early-capture";

/** Chrome's install event; not in the DOM typings. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * What to offer: the browser's own install prompt, Add to Home Screen steps for Safari, steps
 * that start with "open in Safari" for other iOS browsers, or nothing.
 */
export type InstallMode = "prompt" | "ios-safari" | "ios-other" | "hidden";

export type InstallEnv = {
  /** Already running as an installed app. */
  standalone: boolean;
  /** The browser has offered to install (a `beforeinstallprompt` is waiting). */
  canPrompt: boolean;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
};

/** iPhone, iPod, or iPad, including iPadOS, which reports itself as a Mac with a touch screen. */
export function isIos({ userAgent, platform, maxTouchPoints }: InstallEnv): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

/** Safari itself, not Chrome, Firefox, Edge, Opera, or the Google app wrapping WebKit. */
export function isSafari(userAgent: string): boolean {
  return (
    /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser/.test(userAgent)
  );
}

export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone) return "hidden";
  // iOS browsers never offer a prompt; checking iOS first keeps that true wherever it's faked.
  if (isIos(env)) return isSafari(env.userAgent) ? "ios-safari" : "ios-other";
  return env.canPrompt ? "prompt" : "hidden";
}

const STANDALONE_QUERY = "(display-mode: standalone), (display-mode: fullscreen)";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return installed || nav.standalone === true || window.matchMedia(STANDALONE_QUERY).matches;
}

/** Starts catching the install events. Safe to call more than once. */
export function startInstallListener() {
  if (started || typeof window === "undefined") return;
  started = true;
  // An event that fired before this module loaded was parked by the <head> script.
  const early = (window as unknown as Record<string, BeforeInstallPromptEvent | undefined>)[
    EARLY_INSTALL_KEY
  ];
  if (early) deferred = early;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chrome's own mini-infobar away; the app offers its labelled button instead.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

startInstallListener();

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia(STANDALONE_QUERY);
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

export function getInstallMode(): InstallMode {
  return installMode({
    standalone: isStandalone(),
    canPrompt: deferred !== null,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

export const getServerInstallMode = (): InstallMode => "hidden";

/** Opens the browser's install prompt. The event works only once, so it is dropped after. */
export async function promptInstall() {
  const event = deferred;
  if (!event) return;
  deferred = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") installed = true;
  } finally {
    emit();
  }
}
