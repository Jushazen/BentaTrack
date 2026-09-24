import type { Metadata } from "next";
import { Wordmark } from "@/components/layout/wordmark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · BentaTrack" };

/** Only same-site paths are allowed as a return address after login. */
function safeCallbackUrl(value: string | string[] | undefined): string {
  const url = Array.isArray(value) ? value[0] : value;
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/login")) {
    return "/dashboard";
  }
  return url;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  return (
    <main className="bg-surface flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-bg w-full max-w-sm rounded-lg border p-6 sm:p-8">
        <Wordmark />
        <h1 className="font-display text-text mt-6 text-2xl">Log in to BentaTrack</h1>
        <p className="text-muted mt-1 text-sm">Use the email and password the owner gave you.</p>
        <LoginForm callbackUrl={safeCallbackUrl(params.callbackUrl)} />
      </div>
    </main>
  );
}
