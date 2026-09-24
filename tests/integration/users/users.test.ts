import bcrypt from "bcryptjs";
import { beforeEach, expect, test, vi } from "vitest";
import { createStaffUser, resetUserPassword, setUserActive } from "@/features/users/actions";
import { listUsers } from "@/features/users/queries";
import { verifyCredentials } from "@/lib/auth";
import { db } from "@/lib/db";
import { makeUser, resetTestDatabase } from "../helpers/db";

// getServerSession needs a real request, and revalidatePath needs Next's request store.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const PASSWORD = "Estetika-2026";
const NEW_PASSWORD = "Another-Pass-9";

async function signInAs(role: "OWNER" | "STAFF") {
  const user = await makeUser(role);
  session.current = { user: { id: user.id } };
  return user;
}

async function createStaff(email = "maria@estetika.ph") {
  const result = await createStaffUser({ name: "Maria", email, password: PASSWORD });
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

test("[FR-045] the owner creates a staff account that can log in", async () => {
  await signInAs("OWNER");
  const result = await createStaffUser({
    name: "  Maria Santos ",
    email: " Maria@Estetika.PH ",
    password: PASSWORD,
  });
  expect(result).toMatchObject({
    ok: true,
    data: { name: "Maria Santos", email: "maria@estetika.ph", role: "STAFF", active: true },
  });
  expect(result.ok && "passwordHash" in result.data).toBe(false);
  expect(await verifyCredentials("maria@estetika.ph", PASSWORD)).toMatchObject({ role: "STAFF" });
});

test("[FR-045] the owner resets a staff password: the old one stops working, the new one works", async () => {
  await signInAs("OWNER");
  const staff = await createStaff();
  expect(await resetUserPassword({ userId: staff.id, password: NEW_PASSWORD })).toMatchObject({
    ok: true,
  });
  expect(await verifyCredentials(staff.email, PASSWORD)).toBeNull();
  expect(await verifyCredentials(staff.email, NEW_PASSWORD)).toMatchObject({ id: staff.id });
});

test("[FR-045] a deactivated account can't log in, keeps its records, and can be reactivated", async () => {
  await signInAs("OWNER");
  const staff = await createStaff();
  await db.sale.create({
    data: {
      id: crypto.randomUUID(),
      occurredAt: new Date(),
      staffId: staff.id,
      subtotal: 10_000,
      total: 10_000,
      paymentMethod: "CASH",
    },
  });

  expect(await setUserActive({ userId: staff.id, active: false })).toMatchObject({
    ok: true,
    data: { active: false },
  });
  expect(await verifyCredentials(staff.email, PASSWORD)).toBeNull();
  expect(await db.sale.count({ where: { staffId: staff.id } })).toBe(1);
  expect(await db.user.count({ where: { id: staff.id } })).toBe(1);

  expect(await setUserActive({ userId: staff.id, active: true })).toMatchObject({
    ok: true,
    data: { active: true },
  });
  expect(await verifyCredentials(staff.email, PASSWORD)).toMatchObject({ id: staff.id });
});

test("[FR-045] owner accounts can't be reset or deactivated from the accounts screen", async () => {
  const owner = await signInAs("OWNER");
  expect(await setUserActive({ userId: owner.id, active: false })).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
  expect(await resetUserPassword({ userId: owner.id, password: NEW_PASSWORD })).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
  expect(await db.user.findUnique({ where: { id: owner.id } })).toMatchObject({ active: true });
  expect(await setUserActive({ userId: "no-such-user", active: false })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
});

test("[FR-045] the owner sees every account, without password hashes", async () => {
  await signInAs("OWNER");
  await createStaff();
  const result = await listUsers();
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.data.map((u) => u.role)).toEqual(["OWNER", "STAFF"]);
  for (const user of result.data) expect(user).not.toHaveProperty("passwordHash");
});

test("[FR-046] passwords shorter than 8 characters are refused", async () => {
  await signInAs("OWNER");
  const short = await createStaffUser({
    name: "Maria",
    email: "m@estetika.ph",
    password: "1234567",
  });
  expect(short).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", fieldErrors: { password: [expect.stringMatching(/at least 8/)] } },
  });
  expect(await db.user.count({ where: { email: "m@estetika.ph" } })).toBe(0);

  const staff = await createStaff();
  expect(await resetUserPassword({ userId: staff.id, password: "short" })).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", fieldErrors: { password: [expect.any(String)] } },
  });
  expect(await verifyCredentials(staff.email, PASSWORD)).not.toBeNull();
});

test("[FR-046] created and reset passwords are stored only as bcrypt hashes", async () => {
  await signInAs("OWNER");
  const staff = await createStaff();
  const created = await db.user.findUniqueOrThrow({ where: { id: staff.id } });
  expect(created.passwordHash).not.toContain(PASSWORD);
  expect(created.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
  expect(await bcrypt.compare(PASSWORD, created.passwordHash)).toBe(true);

  await resetUserPassword({ userId: staff.id, password: NEW_PASSWORD });
  const reset = await db.user.findUniqueOrThrow({ where: { id: staff.id } });
  expect(reset.passwordHash).not.toContain(NEW_PASSWORD);
  expect(await bcrypt.compare(NEW_PASSWORD, reset.passwordHash)).toBe(true);
});

test("[USERS-DUP] a second account with the same email is refused, ignoring case", async () => {
  await signInAs("OWNER");
  await createStaff("maria@estetika.ph");
  const duplicate = await createStaffUser({
    name: "Other Maria",
    email: "MARIA@estetika.ph",
    password: PASSWORD,
  });
  expect(duplicate).toMatchObject({
    ok: false,
    error: { code: "CONFLICT", fieldErrors: { email: [expect.stringMatching(/already used/)] } },
  });
  expect(await db.user.count({ where: { email: "maria@estetika.ph" } })).toBe(1);
});

test("[USERS-DUP] an invalid email is refused before touching the database", async () => {
  await signInAs("OWNER");
  expect(
    await createStaffUser({ name: "Maria", email: "not-an-email", password: PASSWORD }),
  ).toMatchObject({
    ok: false,
    error: { code: "VALIDATION", fieldErrors: { email: [expect.any(String)] } },
  });
  expect(await db.user.count({ where: { role: "STAFF" } })).toBe(0);
});

test("[USERS-STAFF-DENIED] staff can't list, create, reset, or deactivate accounts", async () => {
  const other = await makeUser("STAFF", "other@estetika.ph");
  await signInAs("STAFF");
  const denied = { ok: false, error: { code: "FORBIDDEN" } };

  expect(await listUsers()).toMatchObject(denied);
  expect(
    await createStaffUser({ name: "Sneaky", email: "sneaky@estetika.ph", password: PASSWORD }),
  ).toMatchObject(denied);
  expect(await resetUserPassword({ userId: other.id, password: NEW_PASSWORD })).toMatchObject(
    denied,
  );
  expect(await setUserActive({ userId: other.id, active: false })).toMatchObject(denied);

  expect(await db.user.count({ where: { email: "sneaky@estetika.ph" } })).toBe(0);
  const untouched = await db.user.findUniqueOrThrow({ where: { id: other.id } });
  expect(untouched).toMatchObject({ active: true, passwordHash: other.passwordHash });
});

test("[USERS-STAFF-DENIED] signed-out and deactivated callers are refused too", async () => {
  const unauthorized = { ok: false, error: { code: "UNAUTHORIZED" } };
  expect(await listUsers()).toMatchObject(unauthorized);
  expect(
    await createStaffUser({ name: "Anon", email: "anon@estetika.ph", password: PASSWORD }),
  ).toMatchObject(unauthorized);

  const owner = await signInAs("OWNER");
  await db.user.update({ where: { id: owner.id }, data: { active: false } });
  expect(
    await createStaffUser({ name: "Late", email: "late@estetika.ph", password: PASSWORD }),
  ).toMatchObject(unauthorized);
  expect(await db.user.count({ where: { role: "STAFF" } })).toBe(0);
});
