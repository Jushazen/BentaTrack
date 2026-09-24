import { LayoutDashboard, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access · BentaTrack" };

export default function ForbiddenPage() {
  return (
    <main className="bg-surface flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-bg max-w-sm rounded-lg border p-8 text-center">
        <ShieldX aria-hidden className="text-muted mx-auto size-10" strokeWidth={1.5} />
        <h1 className="font-display text-text mt-4 text-2xl">
          You don&apos;t have access to this page
        </h1>
        <p className="text-muted mt-2">Only the owner can open it. Ask the owner if you need it.</p>
        <Link href="/dashboard" className={buttonClasses("secondary", "mt-6")}>
          <LayoutDashboard aria-hidden className="size-4" />
          <span>Back to dashboard</span>
        </Link>
      </div>
    </main>
  );
}
