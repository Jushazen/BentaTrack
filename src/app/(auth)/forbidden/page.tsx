import { LayoutDashboard, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "No access · BentaTrack" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="max-w-sm text-center">
        <ShieldX aria-hidden className="mx-auto size-10 opacity-70" />
        <h1 className="mt-4 text-2xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 opacity-80">Only the owner can open it. Ask the owner if you need it.</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-current/25 px-4 py-2.5 font-medium"
        >
          <LayoutDashboard aria-hidden className="size-4" />
          <span>Back to dashboard</span>
        </Link>
      </div>
    </main>
  );
}
