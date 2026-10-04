// What account changes do to a device (FR-045, FR-060, FR-036, FR-053; leaf 9.5): a session ended
// elsewhere while the device was offline is noticed on reconnect and the device goes to the
// sign-out page, its queued changes kept; and the owner sends a deactivated staff member's queued
// changes under that staff member's name, any refused kept with the reason.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { RecordSaleInput } from "@/features/sales/schemas";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";
import { outboxEntries, readEntry } from "@/lib/offline/outbox";
import {
  checkServerSession,
  flushOutbox,
  leaveIfSessionEnded,
  runCommand,
  setSyncUser,
} from "@/lib/offline/sync";
import { fail, ok, type Result } from "@/lib/result";

const OWNER = { id: "user-owner", name: "Odette", role: "OWNER" as const };
const STAFF = { id: "user-ana", name: "Ana", role: "STAFF" as const };

let db: OfflineDb;
let dbCount = 0;
/** Bodies the fake server received, in order. */
let sent: { kind: string; recordedBy: string | null; input: { id: string } }[];

function sale(occurredAt = new Date().toISOString()): RecordSaleInput {
  return {
    id: randomUUID(),
    occurredAt,
    items: [{ productId: "bag", quantity: 1, unitPrice: 50_000 }],
    discount: null,
    paymentMethod: "CASH",
    customerInfo: "",
  };
}

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

/** Fakes /api/sync: POST answers with `answer`; GET (the session check) with `status`. */
function fakeServer(
  answer: (body: (typeof sent)[number]) => Result<unknown> = () => ok({ saved: true }),
  status: () => Response = () => Response.json(ok({ ended: null, userId: OWNER.id })),
) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return status();
    const body = JSON.parse(String(init.body)) as (typeof sent)[number];
    sent.push(body);
    const reply = answer(body);
    return Response.json(reply, { status: reply.ok ? 200 : 409 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  db = openOfflineDb(`bentatrack-sync-accounts-${++dbCount}`);
  sent = [];
  setSyncUser(OWNER);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setSyncUser(null);
  await db.delete();
});

function stubLocation() {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  return assign;
}

test("[FR-045-RECONNECT] a reconnecting device whose account was deactivated or whose password was reset goes to the sign-out page, its queued changes kept", async () => {
  const assign = stubLocation();

  fakeServer(undefined, () => Response.json(ok({ ended: null, userId: STAFF.id })));
  expect(await checkServerSession()).toEqual({ state: "active", userId: STAFF.id });
  expect(await leaveIfSessionEnded()).toBe(false);
  expect(assign).not.toHaveBeenCalled();

  for (const reason of ["deactivated", "password"] as const) {
    fakeServer(undefined, () => Response.json(ok({ ended: reason, userId: STAFF.id })));
    expect(await checkServerSession()).toEqual({ state: "ended", reason });
    expect(await leaveIfSessionEnded()).toBe(true);
    expect(assign).toHaveBeenLastCalledWith(`/session-ended?reason=${reason}`);
  }

  // No session at all, or no answer: nothing to act on.
  fakeServer(undefined, () =>
    Response.json(fail("UNAUTHORIZED", "Please log in again."), { status: 401 }),
  );
  expect(await checkServerSession()).toEqual({ state: "signed-out" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Promise.reject(new TypeError("offline"))),
  );
  expect(await checkServerSession()).toEqual({ state: "unreachable" });
  expect(await leaveIfSessionEnded()).toBe(false);
  expect(assign).toHaveBeenCalledTimes(2);

  // The deactivated staff member's sale, made offline: its sync is refused and it stays.
  setSyncUser(STAFF);
  setOnline(false);
  const left = sale();
  expect(await runCommand("SALE", left, db)).toEqual(ok({ queued: true }));
  setOnline(true);
  fakeServer(() => fail("UNAUTHORIZED", "Please log in again."));
  const report = await flushOutbox({ db });
  expect(report.stopped).toBe("signed-out");
  expect((await outboxEntries(db)).map((entry) => entry.id)).toEqual([left.id]);
});

test("[FR-060-RECONNECT] a reconnecting device of an owner who changed their password elsewhere goes to the sign-out page", async () => {
  const assign = stubLocation();
  fakeServer(undefined, () => Response.json(ok({ ended: "password", userId: OWNER.id })));
  expect(await leaveIfSessionEnded()).toBe(true);
  expect(assign).toHaveBeenCalledWith("/session-ended?reason=password");
});

/** Ana queues sales offline, then her account is deactivated; the owner signs in. */
async function anaLeftChanges(times: string[]) {
  setSyncUser(STAFF);
  setOnline(false);
  fakeServer();
  const sales = times.map((at) => sale(at));
  for (const made of sales) await runCommand("SALE", made, db);
  setSyncUser(OWNER);
  return sales;
}

test("[FR-036-DEACTIVATED-SEND] the owner sends a deactivated staff member's queued changes, still under that staff member's name; staff can't", async () => {
  const [before] = await anaLeftChanges([new Date(Date.now() - 60_000).toISOString()]);
  const own = sale();
  await runCommand("SALE", own, db);
  setOnline(true);
  fakeServer();

  // A routine sync sends only the owner's own change.
  await flushOutbox({ db });
  expect(sent.map((body) => [body.input.id, body.recordedBy])).toEqual([[own.id, OWNER.id]]);

  // Staff can't send another person's changes.
  setSyncUser({ id: "user-ben", name: "Ben", role: "STAFF" });
  expect(await flushOutbox({ db, sendFor: STAFF.id })).toMatchObject({ synced: [] });
  expect(sent).toHaveLength(1);

  setSyncUser(OWNER);
  const report = await flushOutbox({ db, sendFor: STAFF.id });
  expect(report.synced).toHaveLength(1);
  expect(sent.slice(1).map((body) => [body.input.id, body.recordedBy])).toEqual([
    [before.id, STAFF.id],
  ]);
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-036-DEACTIVATED-AFTER] a deactivated staff member's change made after the deactivation is refused and kept with the reason", async () => {
  const [before, after] = await anaLeftChanges([
    new Date(Date.now() - 60_000).toISOString(),
    new Date().toISOString(),
  ]);
  setOnline(true);
  const tooLate = "This was recorded after Ana's account was deactivated, so it can't be saved.";
  fakeServer((body) =>
    body.input.id === after.id ? fail("FORBIDDEN", tooLate) : ok({ saved: true }),
  );

  const report = await flushOutbox({ db, sendFor: STAFF.id });
  expect(report.synced).toHaveLength(1);
  expect(report.refused).toEqual([{ summary: "Sale of ₱500.00 (1 item)", message: tooLate }]);
  const kept = await outboxEntries(db);
  expect(kept.map((entry) => [entry.id, entry.lastError])).toEqual([[after.id, tooLate]]);
  expect(readEntry(kept[0])?.payload.userId).toBe(STAFF.id);
  expect(sent.map((body) => body.input.id)).toEqual([before.id, after.id]);
});
