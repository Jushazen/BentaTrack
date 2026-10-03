"use client";

// Mounted in the root layout so the install event is caught on every page, including the
// login page, where Chrome often fires it before the signed-in shell has loaded (FR-061).
import { useEffect } from "react";
import { startInstallListener } from "./install-store";

export function InstallPromptListener() {
  useEffect(() => startInstallListener(), []);
  return null;
}
