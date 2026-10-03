"use server";

// Server actions (mutations): the owner's own password (FR-060). Leaf 8.1.
// Owner only (account.password); staff passwords are reset by the owner (FR-045). A change ends
// every session of the account, this device's included, so the owner logs in again with it.
import { requireCapability, END_ALL_SESSIONS, hashPassword, verifyCredentials } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, invalid, ok, type Result } from "@/lib/result";
import { changeOwnPasswordSchema, type ChangeOwnPasswordInput } from "./schemas";

const WRONG_CURRENT = "That isn't your current password.";

export async function changeOwnPassword(
  input: ChangeOwnPasswordInput,
): Promise<Result<{ signedOut: true }>> {
  const auth = await requireCapability("account.password");
  if (!auth.ok) return auth;
  const parsed = changeOwnPasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues);
  const { currentPassword, newPassword } = parsed.data;

  if (!(await verifyCredentials(auth.data.email, currentPassword))) {
    return fail("VALIDATION", WRONG_CURRENT, { currentPassword: [WRONG_CURRENT] });
  }

  try {
    await db.user.update({
      where: { id: auth.data.id },
      data: { passwordHash: await hashPassword(newPassword), ...END_ALL_SESSIONS },
    });
  } catch (err) {
    console.error("password change failed", err);
    return fail("CONFLICT", "Your password couldn't be changed. Please try again.");
  }
  return ok({ signedOut: true });
}
