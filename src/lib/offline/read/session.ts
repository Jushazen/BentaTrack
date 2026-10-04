// Who is signed in, when the server can't be asked (leaf 9.2). While online, the service worker
// keeps a copy of the NextAuth session reply in a cache that is emptied at every sign-in and
// sign-out (src/app/sw.ts); the offline app reads it to know whose pages to draw. It holds the
// name, email, id, and role, never a password.
import type { Role } from "@/generated/prisma/enums";

export const SESSION_CACHE = "session";
export const SESSION_URL = "/api/auth/session";

export type SavedSession = { id: string; name: string; email: string; role: Role };

/** The signed-in user in a /api/auth/session reply, or null when nobody is signed in. */
export function parseSession(body: unknown): SavedSession | null {
  const user = (body as { user?: Record<string, unknown> } | null)?.user;
  if (!user) return null;
  const { id, name, email, role } = user;
  if (typeof id !== "string" || (role !== "OWNER" && role !== "STAFF")) return null;
  return {
    id,
    name: typeof name === "string" ? name : "",
    email: typeof email === "string" ? email : "",
    role,
  };
}

/** The session saved on this device, or null if there is none (signed out, or never saved). */
export async function savedSession(
  cacheStorage: CacheStorage | undefined = globalThis.caches,
): Promise<SavedSession | null> {
  try {
    const response = await cacheStorage?.match(SESSION_URL, { cacheName: SESSION_CACHE });
    return response ? parseSession(await response.json()) : null;
  } catch {
    return null;
  }
}
