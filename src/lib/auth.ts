// NextAuth.js v4 credentials config (email + password) and session helpers.
// Two layers (Next 16 auth guide): src/proxy.ts does fast optimistic redirects from the JWT;
// getCurrentUser()/requireCapability() re-read the user from the database on every server
// request, so deactivation and role changes take effect immediately (FR-045, §5.2).
// Each session also carries the user's sessionVersion from login; raising it in the database
// (password change or reset) ends every session of that user on every device (FR-060).
import bcrypt from "bcryptjs";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { can, type Capability } from "@/lib/permissions";
import { fail, ok, type Result } from "@/lib/result";

export const PASSWORD_MIN_LENGTH = 8; // FR-046
export const BCRYPT_ROUNDS = 12;
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days, so offline phones stay signed in (FR-050)

export type SessionUser = { id: string; email: string; name: string; role: Role };

/** What a successful login puts in the session. */
export type SignedInUser = SessionUser & { sessionVersion: number };

/** Why a session that still has its cookie no longer counts. */
export type SessionEndReason = "password" | "deactivated";

/** Spread into a user update to end every session of that user (FR-060, FR-045). */
export const END_ALL_SESSIONS = { sessionVersion: { increment: 1 } } as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 72) return "Password must be at most 72 characters."; // bcrypt limit
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = "$2b$12$7idUWVVihCdkVtwaKygHo.pT2d48nWLOvjzUMRvn9xZwz29DBp.hi";

/** FR-030, FR-044: checks email + password. Returns null for any failure, including inactive users. */
export async function verifyCredentials(
  email: unknown,
  password: unknown,
): Promise<SignedInUser | null> {
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return null;
  }
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches || !user.active) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.sessionVersion,
  };
}

type SessionCheck =
  { user: SessionUser; ended: null } | { user: null; ended: SessionEndReason | null };

/**
 * Checks a session against the database. `ended` says why a session that exists no longer
 * counts; it is null when there was no session at all.
 */
export async function checkSession(
  userId: string | undefined,
  sessionVersion: number | undefined,
): Promise<SessionCheck> {
  if (!userId) return { user: null, ended: null };
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, active: true, sessionVersion: true },
  });
  if (!user?.active) return { user: null, ended: "deactivated" };
  // Sessions from before sessionVersion existed carry none; they match version 0.
  if (user.sessionVersion !== (sessionVersion ?? 0)) return { user: null, ended: "password" };
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    ended: null,
  };
}

/** The user behind a session, or null if deactivated, gone, or the session was ended. */
export async function loadActiveUser(
  userId: string | undefined,
  sessionVersion?: number,
): Promise<SessionUser | null> {
  return (await checkSession(userId, sessionVersion)).user;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: (credentials) => verifyCredentials(credentials?.email, credentials?.password),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as SignedInUser;
        token.id = u.id;
        token.role = u.role;
        token.sessionVersion = u.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.sessionVersion = token.sessionVersion;
      }
      return session;
    },
  },
};

/** For server components, route handlers, and actions. Always re-checked against the database. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await currentSession()).user;
}

async function currentSession(): Promise<SessionCheck> {
  const session = await getServerSession(authOptions);
  return checkSession(session?.user?.id, session?.user?.sessionVersion);
}

/** For server actions: `const auth = await requireCapability("x"); if (!auth.ok) return auth;` */
export async function requireCapability(capability: Capability): Promise<Result<SessionUser>> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "Please log in again.");
  if (!can(user.role, capability)) {
    return fail("FORBIDDEN", "You don't have permission to do that.");
  }
  return ok(user);
}

/**
 * For pages: redirects instead of returning. A session that was ended goes to /session-ended,
 * which signs the device out; sending it straight to /login would loop, because the proxy sends
 * anyone with a session cookie from /login back to /dashboard.
 */
export async function requirePageCapability(capability?: Capability): Promise<SessionUser> {
  const { user, ended } = await currentSession();
  if (!user) redirect(ended ? `/session-ended?reason=${ended}` : "/login");
  if (capability && !can(user.role, capability)) redirect("/forbidden");
  return user;
}
