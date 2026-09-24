import type { Metadata } from "next";
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
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm font-medium tracking-widest uppercase opacity-70">Estetika</p>
        <h1 className="mt-1 text-2xl font-semibold">Log in to BentaTrack</h1>
        <LoginForm callbackUrl={safeCallbackUrl(params.callbackUrl)} />
      </div>
    </main>
  );
}
