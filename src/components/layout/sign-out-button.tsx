"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`text-text hover:bg-secondary flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left ${className}`}
    >
      <LogOut aria-hidden className="text-muted size-5 shrink-0" strokeWidth={1.75} />
      <span>Log out</span>
    </button>
  );
}
