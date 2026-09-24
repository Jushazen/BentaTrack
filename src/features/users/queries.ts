// Server-side reads: User account management (FR-044–046). Leaf 2.3.
import type { Role } from "@/generated/prisma/enums";
import { requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, type Result } from "@/lib/result";

/** What the owner sees about an account. Never includes the password hash. */
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
};

export const userRowSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

/** Owner first, then active accounts before deactivated ones, then by name. */
export async function listUsers(): Promise<Result<UserRow[]>> {
  const auth = await requireCapability("users.manage");
  if (!auth.ok) return auth;
  const users = await db.user.findMany({
    select: userRowSelect,
    orderBy: [{ role: "asc" }, { active: "desc" }, { name: "asc" }],
  });
  return ok(users);
}
