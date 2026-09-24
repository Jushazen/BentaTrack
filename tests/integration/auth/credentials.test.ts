import { beforeEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, loadActiveUser, requireCapability, verifyCredentials } from "@/lib/auth";
import { resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request; stand in a session for the requireCapability tests.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));

const PASSWORD = "Estetika-2026";

async function createUser(email: string, role: "OWNER" | "STAFF" = "STAFF", active = true) {
  return db.user.create({
    data: { email, name: "Test", role, active, passwordHash: await hashPassword(PASSWORD) },
  });
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

test("[FR-030] login needs the right password; missing or wrong passwords are refused", async () => {
  const user = await createUser("staff@estetika.ph");
  expect(await verifyCredentials("staff@estetika.ph", PASSWORD)).toMatchObject({
    id: user.id,
    role: "STAFF",
  });
  expect(await verifyCredentials("staff@estetika.ph", "wrong-password")).toBeNull();
  expect(await verifyCredentials("staff@estetika.ph", "")).toBeNull();
  expect(await verifyCredentials("staff@estetika.ph", undefined)).toBeNull();
  expect(await verifyCredentials("nobody@estetika.ph", PASSWORD)).toBeNull();
});

test("[FR-044] login uses the email address, ignoring case and spaces", async () => {
  await createUser("owner@estetika.ph", "OWNER");
  expect(await verifyCredentials("  OWNER@Estetika.PH ", PASSWORD)).toMatchObject({
    email: "owner@estetika.ph",
    role: "OWNER",
  });
});

test("[FR-044] two accounts cannot share an email", async () => {
  await createUser("staff@estetika.ph");
  await expect(createUser("staff@estetika.ph")).rejects.toMatchObject({ code: "P2002" });
  // Mixed case is blocked at the database too (emails must be stored lowercase).
  await expect(createUser("Staff@Estetika.ph")).rejects.toThrow(/User_email_lowercase|check/i);
});

test("[FR-046] the stored password is a hash, never the password itself", async () => {
  const user = await createUser("staff@estetika.ph");
  expect(user.passwordHash).not.toBe(PASSWORD);
  expect(user.passwordHash).not.toContain(PASSWORD);
});

test("[AUTH-DEACTIVATED] a deactivated account cannot log in", async () => {
  await createUser("gone@estetika.ph", "STAFF", false);
  expect(await verifyCredentials("gone@estetika.ph", PASSWORD)).toBeNull();
});

test("[AUTH-DEACTIVATED] deactivating a user ends their existing session immediately", async () => {
  const user = await createUser("staff@estetika.ph");
  session.current = { user: { id: user.id } };
  expect(await requireCapability("sales.create")).toMatchObject({ ok: true });

  await db.user.update({ where: { id: user.id }, data: { active: false } });
  expect(await loadActiveUser(user.id)).toBeNull();
  expect(await requireCapability("sales.create")).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
});

test("[FR-032] server actions refuse staff for owner-only capabilities, using the role in the database", async () => {
  const user = await createUser("staff@estetika.ph");
  session.current = { user: { id: user.id } };
  expect(await requireCapability("users.manage")).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });

  await db.user.update({ where: { id: user.id }, data: { role: "OWNER" } });
  expect(await requireCapability("users.manage")).toMatchObject({ ok: true });

  session.current = null;
  expect(await requireCapability("sales.create")).toMatchObject({
    ok: false,
    error: { code: "UNAUTHORIZED" },
  });
});
