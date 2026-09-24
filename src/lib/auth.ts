// NextAuth.js v4 credentials config (email + password) and session helpers.
// Two layers (Next 16 auth guide): src/proxy.ts does fast optimistic redirects from the JWT;
// getCurrentUser()/requireCapability() re-read the user from the database on every server
// request, so deactivation and role changes take effect immediately (FR-045, §5.2).
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
): Promise<SessionUser | null> {
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return null;
  }
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** The user behind a session, or null if they no longer exist or were deactivated. */
export async function loadActiveUser(userId: string | undefined): Promise<SessionUser | null> {
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!user?.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
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
        const u = user as SessionUser;
        token.id = u.id;
        token.role = u.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

/** For server components, route handlers, and actions. Always re-checked against the database. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return loadActiveUser(session?.user?.id);
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

/** For pages: redirects to /login or /forbidden instead of returning. */
export async function requirePageCapability(capability?: Capability): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (capability && !can(user.role, capability)) redirect("/forbidden");
  return user;
}
