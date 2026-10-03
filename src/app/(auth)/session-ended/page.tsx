// Where a session that no longer counts is sent (password changed or account deactivated; FR-060,
// FR-045). Public: the proxy doesn't protect it, so a stale session cookie can't bounce it.
import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { SignOutNow } from "./sign-out-now";

export const metadata: Metadata = { title: "Signed out · BentaTrack" };

const REASONS = ["password", "deactivated"] as const;

export default async function SessionEndedPage({ searchParams }: PageProps<"/session-ended">) {
  const raw = (await searchParams).reason;
  const reason = REASONS.find((value) => value === raw) ?? "ended";

  return (
    <main className="bg-surface flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-bg max-w-sm rounded-lg border p-8 text-center">
        <LogOut aria-hidden className="text-muted mx-auto size-10" strokeWidth={1.5} />
        <h1 className="font-display text-text mt-4 text-2xl">You&apos;ve been logged out</h1>
        <p className="text-muted mt-2">Taking you to the login page…</p>
        <SignOutNow loginUrl={`/login?signedOut=${reason}`} />
      </div>
    </main>
  );
}
