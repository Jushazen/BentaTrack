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

/** Why the user was signed out, from /session-ended or a password change (FR-060, FR-045). */
const SIGNED_OUT_MESSAGES: Record<string, string> = {
  password: "Your password was changed, so you were logged out. Log in with the new password.",
  deactivated:
    "Your account was turned off, so you were logged out. Ask the owner if you need access.",
  ended: "You were logged out. Please log in again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const signedOut = Array.isArray(params.signedOut) ? params.signedOut[0] : params.signedOut;
  const signedOutMessage = signedOut ? SIGNED_OUT_MESSAGES[signedOut] : undefined;
  return (
    <main className="bg-surface flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-border bg-bg w-full max-w-sm rounded-lg border p-6 sm:p-8">
        <Wordmark />
        <h1 className="font-display text-text mt-6 text-2xl">Log in to BentaTrack</h1>
        <p className="text-muted mt-1 text-sm">Use the email and password the owner gave you.</p>
        {signedOutMessage && (
          <p role="status" className="bg-surface text-text mt-4 rounded-lg px-3 py-2.5 text-sm">
            {signedOutMessage}
          </p>
        )}
        <LoginForm callbackUrl={safeCallbackUrl(params.callbackUrl)} />
      </div>
    </main>
  );
}
