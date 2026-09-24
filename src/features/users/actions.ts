"use server";

// Server actions (mutations): User account management (FR-044–046). Leaf 2.3.
// Owner only (users.manage). Only STAFF accounts can be changed here, so the owner can never
// lock themselves out. Deactivation takes effect on the user's next request, because
// getCurrentUser() re-reads `active` from the database (src/lib/auth.ts).
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword, requireCapability } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, invalid, ok, type Result } from "@/lib/result";
import { userRowSelect, type UserRow } from "./queries";
import {
  createStaffUserSchema,
  resetPasswordSchema,
  setUserActiveSchema,
  type CreateStaffUserInput,
  type ResetPasswordInput,
  type SetUserActiveInput,
} from "./schemas";

const USERS_PATH = "/users";

/** FR-045: creates an active STAFF account. Emails are unique regardless of case (FR-044). */
export async function createStaffUser(input: CreateStaffUserInput): Promise<Result<UserRow>> {
  const auth = await requireCapability("users.manage");
  if (!auth.ok) return auth;
  const parsed = createStaffUserSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { name, email, password } = parsed.data;

  try {
    const user = await db.user.create({
      data: { name, email, role: "STAFF", passwordHash: await hashPassword(password) },
      select: userRowSelect,
    });
    revalidatePath(USERS_PATH);
    return ok(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return fail("CONFLICT", "That email is already used by another account.", {
        email: ["That email is already used by another account."],
      });
    }
    console.error("createStaffUser failed", err);
    return fail("CONFLICT", "The account couldn't be created. Please try again.");
  }
}

/** Loads a staff account the owner may change, or explains why not. */
async function findStaff(userId: string): Promise<Result<{ id: string }>> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) return fail("NOT_FOUND", "That account no longer exists.");
  if (user.role !== "STAFF") {
    return fail("FORBIDDEN", "Owner accounts can't be changed from this screen.");
  }
  return ok({ id: user.id });
}

/** FR-045: sets a new password for a staff account. */
export async function resetUserPassword(input: ResetPasswordInput): Promise<Result<UserRow>> {
  const auth = await requireCapability("users.manage");
  if (!auth.ok) return auth;
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const target = await findStaff(parsed.data.userId);
  if (!target.ok) return target;
  const user = await db.user.update({
    where: { id: target.data.id },
    data: { passwordHash: await hashPassword(parsed.data.password) },
    select: userRowSelect,
  });
  revalidatePath(USERS_PATH);
  return ok(user);
}

/** FR-045: deactivated users can't log in; their sales and history stay. */
export async function setUserActive(input: SetUserActiveInput): Promise<Result<UserRow>> {
  const auth = await requireCapability("users.manage");
  if (!auth.ok) return auth;
  const parsed = setUserActiveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);

  const target = await findStaff(parsed.data.userId);
  if (!target.ok) return target;
  const user = await db.user.update({
    where: { id: target.data.id },
    data: { active: parsed.data.active },
    select: userRowSelect,
  });
  revalidatePath(USERS_PATH);
  return ok(user);
}
