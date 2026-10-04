// What account changes do to devices (FR-045, FR-060, FR-036, FR-053; leaf 9.5). Account and
// password changes need a connection, so they are never sent through /api/sync. A device asks
// GET /api/sync whether its session still counts, so one that was offline while its account was
// deactivated or its password was changed or reset signs out when it reconnects. And the owner can
// send a deactivated staff member's changes left on a device: they are kept under that person's
// name only if made before the deactivation.
import { randomUUID } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";
import { GET, POST } from "@/app/api/sync/route";
import { changeOwnPassword } from "@/features/account/actions";
import { resetUserPassword, setUserActive } from "@/features/users/actions";
import { hashPassword, verifyCredentials } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Result } from "@/lib/result";
import { makeCategory, makeProduct, resetTestDatabase } from "../helpers/db";

type FakeSession = { user: { id: string; sessionVersion?: number } };
const session = vi.hoisted(() => ({ current: null as FakeSession | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: async () => session.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Passwords are hashed at full bcrypt cost.
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "Estetika-2026";
const NEW_PASSWORD = "Another-Pass-9";
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function makeAccount(role: "OWNER" | "STAFF", email: string, name = role.toLowerCase()) {
  return db.user.create({
    data: { email, name, role, passwordHash: await hashPassword(PASSWORD) },
  });
}

/** Logs in the way NextAuth does and keeps the resulting session as "this device". */
async function logIn(email: string, password = PASSWORD): Promise<FakeSession> {
  const user = await verifyCredentials(email, password);
  if (!user) throw new Error(`could not log in as ${email}`);
  session.current = { user: { id: user.id, sessionVersion: user.sessionVersion } };
  return session.current;
}

type Reply = { status: number; body: Result<Record<string, unknown>> };

async function sync(kind: string, input: Record<string, unknown>, recordedBy?: string | null) {
  const response = await POST(
    new Request("http://localhost/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        recordedBy: recordedBy === undefined ? (session.current?.user.id ?? null) : recordedBy,
        input,
      }),
    }),
  );
  return { status: response.status, body: await response.json() } as Reply;
}

async function sessionStatus(): Promise<Reply> {
  const response = await GET();
  return { status: response.status, body: await response.json() } as Reply;
}

function data(result: Reply): Record<string, unknown> {
  if (!result.body.ok) throw new Error(`${result.body.error.code}: ${result.body.error.message}`);
  return result.body.data;
}

function done<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

beforeEach(async () => {
  await resetTestDatabase();
  session.current = null;
});

test("[ACCOUNT-ONLINE-ONLY] account and password changes can't be sent through the device sync route", async () => {
  await makeAccount("OWNER", "owner@estetika.ph");
  await logIn("owner@estetika.ph");
  for (const kind of [
    "USER_CREATE",
    "USER_RESET_PASSWORD",
    "USER_SET_ACTIVE",
    "ACCOUNT_PASSWORD",
  ]) {
    const reply = await sync(kind, { id: randomUUID(), occurredAt: minutesAgo(1) });
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
  expect(await db.user.count()).toBe(1);
});

test("[FR-045-RECONNECT] GET /api/sync tells a reconnecting device its session ended when its staff password was reset or its account deactivated", async () => {
  expect((await sessionStatus()).status).toBe(401);

  const owner = await makeAccount("OWNER", "owner@estetika.ph");
  const staff = await makeAccount("STAFF", "ana@estetika.ph", "Ana");
  const ownerDevice = await logIn("owner@estetika.ph");
  const staffDevice = await logIn("ana@estetika.ph");
  expect(data(await sessionStatus())).toEqual({ ended: null, userId: staff.id });
  session.current = ownerDevice;
  expect(data(await sessionStatus())).toEqual({ ended: null, userId: owner.id });

  // The owner resets Ana's password while her phone is offline: it is told on reconnect.
  done(await resetUserPassword({ userId: staff.id, password: NEW_PASSWORD }));
  session.current = staffDevice;
  expect(data(await sessionStatus())).toEqual({ ended: "password", userId: staff.id });
  expect((await sync("SALE", { id: randomUUID() })).status).toBe(401);

  // Ana logs in again, then is deactivated: her phone is told that instead.
  const again = await logIn("ana@estetika.ph", NEW_PASSWORD);
  session.current = ownerDevice;
  done(await setUserActive({ userId: staff.id, active: false }));
  session.current = again;
  expect(data(await sessionStatus())).toEqual({ ended: "deactivated", userId: staff.id });
  expect((await sync("SALE", { id: randomUUID() })).status).toBe(401);
});

test("[FR-060-RECONNECT] after the owner changes their password, another device of the account is told its session ended when it reconnects", async () => {
  await makeAccount("OWNER", "owner@estetika.ph");
  const offlinePhone = await logIn("owner@estetika.ph");
  await logIn("owner@estetika.ph");
  done(
    await changeOwnPassword({
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    }),
  );

  session.current = offlinePhone;
  expect(data(await sessionStatus())).toMatchObject({ ended: "password" });
  await logIn("owner@estetika.ph", NEW_PASSWORD);
  expect(data(await sessionStatus())).toMatchObject({ ended: null });
});

async function staffSaleSetup() {
  await makeAccount("OWNER", "owner@estetika.ph", "Odette");
  const staff = await makeAccount("STAFF", "ana@estetika.ph", "Ana");
  const category = await makeCategory("Bags");
  const product = await makeProduct(category.id, { stockQuantity: 10 });
  const sale = (occurredAt: string) => ({
    id: randomUUID(),
    occurredAt,
    items: [{ productId: product.id, quantity: 2, unitPrice: product.sellingPrice }],
    discount: null,
    paymentMethod: "CASH",
    customerInfo: "",
  });
  return { staff, product, sale };
}

/** The owner deactivates Ana; it is recorded as happening `minutes` ago. */
async function deactivate(userId: string, minutes: number) {
  await logIn("owner@estetika.ph");
  done(await setUserActive({ userId, active: false }));
  await db.user.update({ where: { id: userId }, data: { deactivatedAt: minutesAgo(minutes) } });
}

test("[FR-036-DEACTIVATED-SEND] the owner sends a deactivated staff member's sale made before the deactivation; it is recorded under that staff member", async () => {
  const { staff, product, sale } = await staffSaleSetup();
  const made = sale(minutesAgo(30));
  await deactivate(staff.id, 10);

  const sent = await sync("SALE", made, staff.id);
  expect(sent.status).toBe(200);
  expect(data(sent)).toMatchObject({ id: made.id });
  const stored = await db.sale.findUniqueOrThrow({ where: { id: made.id } });
  expect(stored.staffId).toBe(staff.id);
  expect(stored.occurredAt.toISOString()).toBe(made.occurredAt);
  const change = await db.inventoryChange.findFirstOrThrow({ where: { saleId: made.id } });
  expect(change.userId).toBe(staff.id);
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(8);

  // Sent again: applied once.
  expect(data(await sync("SALE", made, staff.id))).toMatchObject({ id: made.id });
  expect(await db.sale.count()).toBe(1);
  // Only what Ana's role allows is accepted for her: an owner-only change isn't.
  const asAna = await sync(
    "CATEGORY_CREATE",
    { id: randomUUID(), name: "Fans", occurredAt: minutesAgo(20) },
    staff.id,
  );
  expect(asAna.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  expect(await db.category.count()).toBe(1);
});

test("[FR-036-DEACTIVATED-AFTER] a deactivated staff member's change made after the deactivation is refused, and nobody else may send another person's changes", async () => {
  const { staff, product, sale } = await staffSaleSetup();
  const late = sale(minutesAgo(5));
  const undated = { ...sale(minutesAgo(30)), occurredAt: undefined };
  await deactivate(staff.id, 10);

  const refused = await sync("SALE", late, staff.id);
  expect(refused.status).toBe(403);
  expect(refused.body).toMatchObject({
    ok: false,
    error: {
      code: "FORBIDDEN",
      message: "This was recorded after Ana's account was deactivated, so it can't be saved.",
    },
  });
  expect((await sync("SALE", undated, staff.id)).body).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
  expect(await db.sale.count()).toBe(0);
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(
    10,
  );

  // An active staff member's changes wait for them: the owner can't send those.
  const ben = await makeAccount("STAFF", "ben@estetika.ph", "Ben");
  const forBen = await sync("SALE", sale(minutesAgo(30)), ben.id);
  expect(forBen.body).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN", message: expect.stringContaining("Someone else recorded this") },
  });
  // Staff never send another person's changes, even a deactivated colleague's.
  await logIn("ben@estetika.ph");
  const byBen = await sync("SALE", sale(minutesAgo(30)), staff.id);
  expect(byBen.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  expect(await db.sale.count()).toBe(0);
});

test("[FR-036-DEACTIVATED-AFTER] deactivating records when; deactivating again keeps it; reactivating clears it", async () => {
  const { staff } = await staffSaleSetup();
  await logIn("owner@estetika.ph");
  const before = Date.now();
  done(await setUserActive({ userId: staff.id, active: false }));
  const first = (await db.user.findUniqueOrThrow({ where: { id: staff.id } })).deactivatedAt;
  expect(first?.getTime()).toBeGreaterThanOrEqual(before - 1000);

  done(await setUserActive({ userId: staff.id, active: false }));
  expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).deactivatedAt).toEqual(
    first,
  );

  done(await setUserActive({ userId: staff.id, active: true }));
  expect(await db.user.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({
    active: true,
    deactivatedAt: null,
  });
});
