// Small status label. Status colours are only for status (style lock); the text always says
// what the colour means, so colour is never the only signal.
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "ok" | "warn" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "text-muted",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`bg-secondary inline-flex items-center rounded-md px-2 py-0.5 text-[13px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
