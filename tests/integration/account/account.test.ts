import { beforeEach, expect, test, vi } from "vitest";
import { changeOwnPassword } from "@/features/account/actions";
import { resetUserPassword, setUserActive } from "@/features/users/actions";
import { getCurrentUser, hashPassword, requirePageCapability, verifyCredentials } from "@/lib/auth";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request, revalidatePath needs Next's request store, and redirect
// throws Next's internal error; replace all three so the outcome can be inspected.
type FakeSession = { user: { id: string; sessionVersion?: number } };
const session = vi.hoisted(() => ({ current: null as FakeSession | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const PASSWORD = "Estetika-2026";
const NEW_PASSWORD = "Another-Pass-9";

async function makeAccount(role: "OWNER" | "STAFF", email: string) {
  return db.user.create({
    data: {
      email,
      name: role === "OWNER" ? "Owner" : "Staff",
      role,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
}

/** Logs in the way NextAuth does and keeps the resulting session as "this device". */
async function logIn(email: string, password = PASSWORD): Promise<FakeSession> {
  const user = await verifyCredentials(email, password);
  if (!user) throw new Error(`could not log in as ${email}`);
  session.current = { user: { id: user.id, sessionVersion: user.sessionVersion } };
  return session.current;
}

function change(
  currentPassword: string,
  newPassword = NEW_PASSWORD,
  confirmPassword = newPassword,
) {
  return changeOwnPassword({ currentPassword, newPassword, confirmPassword });
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

test("[FR-060] the owner changes their own password: the old one stops working, the new one works", async () => {
  await makeAccount("OWNER", "owner@estetika.ph");
  await logIn("owner@estetika.ph");

  expect(await change(PASSWORD)).toEqual({ ok: true, data: { signedOut: true } });
  expect(await verifyCredentials("owner@estetika.ph", PASSWORD)).toBeNull();
  expect(await verifyCredentials("owner@estetika.ph", NEW_PASSWORD)).toMatchObject({
    role: "OWNER",
  });
});

test("[FR-060-WRONG-CURRENT] a wrong current password, a short or mismatched new one, or reusing the current one changes nothing", async () => {
  const owner = await makeAccount("OWNER", "owner@estetika.ph");
  await logIn("owner@estetika.ph");
  const before = owner.passwordHash;

  expect(await change("not-my-password")).toMatchObject({
    ok: false,
    error: {
      code: "VALIDATION",
      fieldErrors: { currentPassword: ["That isn't your current password."] },
    },
  });
  expect(await change(PASSWORD, "short")).toMatchObject({
    ok: false,
    error: { fieldErrors: { newPassword: ["Password must be at least 8 characters."] } },
  });
  expect(await change(PASSWORD, NEW_PASSWORD, "Different-Pass-1")).toMatchObject({
    ok: false,
    error: { fieldErrors: { confirmPassword: ["The two new passwords don't match."] } },
  });
  expect(await change(PASSWORD, PASSWORD)).toMatchObject({
    ok: false,
    error: { fieldErrors: { newPassword: ["Choose a password different from your current one."] } },
  });

  const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
  expect(after.passwordHash).toBe(before);
  expect(after.sessionVersion).toBe(0);
  expect(await getCurrentUser()).toMatchObject({ id: owner.id });
});

test("[FR-060-STAFF-DENIED] staff cannot change their own password or open My account", async () => {
  const staff = await makeAccount("STAFF", "staff@estetika.ph");
  await logIn("staff@estetika.ph");

  expect(await change(PASSWORD)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  expect(await verifyCredentials("staff@estetika.ph", PASSWORD)).toMatchObject({ id: staff.id });
  await expect(requirePageCapability("account.password")).rejects.toThrow("REDIRECT /forbidden");

  session.current = null;
  expect(await change(PASSWORD)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
});

test("[FR-060-SESSIONS] a password change ends every session of the account, this one included", async () => {
  await makeAccount("OWNER", "owner@estetika.ph");
  const otherDevice = await logIn("owner@estetika.ph");
  const thisDevice = await logIn("owner@estetika.ph");

  expect(await change(PASSWORD)).toMatchObject({ ok: true });

  for (const device of [thisDevice, otherDevice]) {
    session.current = device;
    expect(await getCurrentUser()).toBeNull();
    expect(await change(NEW_PASSWORD, "Third-Pass-33")).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  }

  // A fresh login with the new password works.
  await logIn("owner@estetika.ph", NEW_PASSWORD);
  expect(await getCurrentUser()).toMatchObject({ role: "OWNER" });
});

test("[FR-045-SESSIONS] the owner's reset of a staff password signs that staff member out everywhere", async () => {
  const staff = await makeAccount("STAFF", "staff@estetika.ph");
  const staffDevice = await logIn("staff@estetika.ph");
  const owner = await makeAccount("OWNER", "owner@estetika.ph");
  const ownerDevice = await logIn("owner@estetika.ph");

  expect(await resetUserPassword({ userId: staff.id, password: NEW_PASSWORD })).toMatchObject({
    ok: true,
  });

  session.current = staffDevice;
  expect(await getCurrentUser()).toBeNull();
  session.current = ownerDevice;
  expect(await getCurrentUser()).toMatchObject({ id: owner.id });
});

test("[SESSION-ENDED] a session that no longer counts is sent to /session-ended with the reason, not to /login", async () => {
  const owner = await makeAccount("OWNER", "owner@estetika.ph");
  const staff = await makeAccount("STAFF", "staff@estetika.ph");

  // No session at all: the login page.
  await expect(requirePageCapability()).rejects.toThrow("REDIRECT /login");

  // Sessions from before session versions existed still count.
  session.current = { user: { id: staff.id } };
  expect(await requirePageCapability()).toMatchObject({ id: staff.id });

  // Deactivated while signed in.
  const staffDevice = await logIn("staff@estetika.ph");
  session.current = { user: { id: owner.id, sessionVersion: 0 } };
  expect(await setUserActive({ userId: staff.id, active: false })).toMatchObject({ ok: true });
  session.current = staffDevice;
  await expect(requirePageCapability()).rejects.toThrow(
    "REDIRECT /session-ended?reason=deactivated",
  );

  // Password changed on another device.
  const ownerDevice = await logIn("owner@estetika.ph");
  expect(await change(PASSWORD)).toMatchObject({ ok: true });
  session.current = ownerDevice;
  await expect(requirePageCapability()).rejects.toThrow("REDIRECT /session-ended?reason=password");
});
