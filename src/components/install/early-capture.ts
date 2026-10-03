// Chrome can fire `beforeinstallprompt` before the app's JavaScript has loaded, and fires it only
// once per page. This inline script runs from the root layout's <head>, ahead of every bundle,
// and parks the event on `window` for install-store.ts to collect when it starts (FR-061).
export const EARLY_INSTALL_KEY = "__bentaInstallPrompt";

export const EARLY_INSTALL_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.${EARLY_INSTALL_KEY}=e;});`;
