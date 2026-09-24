"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Labelled light/dark switch. Renders a neutral label until mounted to avoid a hydration mismatch. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={`text-text hover:bg-secondary flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left ${className}`}
      data-testid="theme-toggle"
    >
      <Icon aria-hidden className="text-muted size-5 shrink-0" strokeWidth={1.75} />
      <span>{mounted ? (dark ? "Light mode" : "Dark mode") : "Theme"}</span>
    </button>
  );
}
