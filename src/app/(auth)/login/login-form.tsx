"use client";

import { AlertCircle, LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        redirect: false,
      });
      if (!result || result.error) {
        setError("Wrong email or password, or this account is deactivated.");
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    // method="post": if the form is submitted before hydration (slow network, blocked JS), the
    // browser's fallback submit must not put the password in the URL, history, or server logs.
    <form method="post" onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-text block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="border-border bg-bg text-text w-full rounded-lg border px-3 py-2.5 text-base"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-text block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border-border bg-bg text-text w-full rounded-lg border px-3 py-2.5 text-base"
        />
      </div>

      {error && (
        <p role="alert" className="text-danger flex items-start gap-2 text-sm">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-on-primary flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 font-medium transition-[filter] duration-100 ease-out hover:brightness-110 disabled:opacity-60"
      >
        <LogIn aria-hidden className="size-4" />
        <span>{pending ? "Logging in…" : "Log in"}</span>
      </button>
    </form>
  );
}
