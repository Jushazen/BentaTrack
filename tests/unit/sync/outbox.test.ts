import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { RestockInput } from "@/features/inventory/schemas";
import type { RecordSaleInput } from "@/features/sales/schemas";
import { toCatalogProduct } from "@/lib/offline/catalog";
import { openOfflineDb, type OfflineDb } from "@/lib/offline/db";
import { enqueue, outboxEntries, readEntry } from "@/lib/offline/outbox";
import { flushOutbox, lowStockAlertsFrom, runCommand, setSyncUser } from "@/lib/offline/sync";
import { fail, ok, type Result } from "@/lib/result";

const ANA = { id: "user-ana", name: "Ana" };
const BEN = { id: "user-ben", name: "Ben" };

let db: OfflineDb;
let dbName: string;
let dbCount = 0;
/** Bodies the fake server received, in order. */
let sent: { kind: string; recordedBy: string | null; input: { id: string } }[];

type Answer = Result<unknown> | "network-error" | "server-error";

/** Fakes /api/sync: each request takes the next answer (the last one repeats). */
function fakeServer(...answers: Answer[]) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    const answer = answers.length > 1 ? answers.shift()! : answers[0];
    if (answer === "network-error") throw new TypeError("Failed to fetch");
    if (answer === "server-error") return new Response("boom", { status: 502 });
    return Response.json(answer, { status: answer.ok ? 200 : 409 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

function sale(overrides: Partial<RecordSaleInput> = {}): RecordSaleInput {
  return {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    items: [{ productId: "p-bag", quantity: 2, unitPrice: 50_000 }],
    discount: null,
    paymentMethod: "CASH",
    customerInfo: "",
    ...overrides,
  };
}

function restock(overrides: Partial<RestockInput> = {}): RestockInput {
  return {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    productId: "p-bag",
    quantity: 3,
    ...overrides,
  };
}

function saleReply(input: RecordSaleInput, replayed = false) {
  return ok({
    id: input.id,
    subtotal: 100_000,
    discountAmount: 0,
    total: 100_000,
    paymentMethod: "CASH",
    itemCount: 2,
    lowStockAlerts: [],
    replayed,
  });
}

async function catalogStock(productId: string): Promise<number | undefined> {
  return (await db.products.get(productId))?.stockQuantity;
}

beforeEach(async () => {
  dbName = `bentatrack-sync-test-${++dbCount}`;
  db = openOfflineDb(dbName);
  sent = [];
  setSyncUser(ANA);
  await db.products.put(
    toCatalogProduct({
      id: "p-bag",
      name: "Banig Bag",
      code: "BAG-1",
      barcode: null,
      brand: null,
      categoryName: "Bags",
      sellingPrice: 50_000,
      stockQuantity: 10,
      lowStockThreshold: 5,
      imageUrl: null,
    }),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setSyncUser(null);
  await db.delete();
});

test("[FR-034] offline, a sale is saved on the device without touching the network", async () => {
  setOnline(false);
  const fetchMock = fakeServer("network-error");
  const input = sale();

  const reply = await runCommand("SALE", input, db);

  expect(reply).toEqual({ ok: true, data: { queued: true } });
  expect(fetchMock).not.toHaveBeenCalled();
  const [entry] = await outboxEntries(db);
  expect(entry).toMatchObject({ id: input.id, kind: "SALE", attempts: 0, lastError: null });
  expect(readEntry(entry)?.payload).toMatchObject({
    userId: ANA.id,
    userName: "Ana",
    summary: "Sale of ₱1,000.00 (2 items)",
    input,
  });
  // The next offline sale sees the units this one took.
  expect(await catalogStock("p-bag")).toBe(8);
});

test("[FR-034] offline restocks and refunds queue too, and a restock raises the device's stock", async () => {
  setOnline(false);
  fakeServer("network-error");
  await runCommand("RESTOCK", restock({ quantity: 4 }), db);
  await runCommand(
    "REFUND",
    {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      saleId: randomUUID(),
      items: [{ saleItemId: "line-1", quantity: 1 }],
      note: "",
    },
    db,
  );
  const entries = await outboxEntries(db);
  expect(entries.map((entry) => entry.kind)).toEqual(["RESTOCK", "REFUND"]);
  expect(entries.map((entry) => readEntry(entry)?.payload.summary)).toEqual([
    "Restock of 4 × Banig Bag",
    "Refund of 1 item",
  ]);
  expect(await catalogStock("p-bag")).toBe(14);
});

test("[FR-036] a command that gets no answer online stays queued; an answered one leaves the outbox", async () => {
  setOnline(true);
  fakeServer("network-error");
  const lost = sale();
  expect(await runCommand("SALE", lost, db)).toEqual({ ok: true, data: { queued: true } });
  expect((await outboxEntries(db)).map((entry) => [entry.id, entry.attempts])).toEqual([
    [lost.id, 1],
  ]);

  fakeServer("server-error");
  const failed = sale();
  expect(await runCommand("SALE", failed, db)).toEqual({ ok: true, data: { queued: true } });

  const done = sale();
  fakeServer(saleReply(done));
  const reply = await runCommand("SALE", done, db);
  expect(reply.ok && !reply.data.queued && reply.data.total).toBe(100_000);
  expect((await outboxEntries(db)).map((entry) => entry.id)).toEqual([lost.id, failed.id]);
  expect(sent.at(-1)).toMatchObject({ kind: "SALE", recordedBy: ANA.id, input: { id: done.id } });
});

test("[FR-036] the outbox survives closing and reopening the app", async () => {
  setOnline(false);
  const input = sale();
  await runCommand("SALE", input, db);
  db.close();

  const reopened = openOfflineDb(dbName);
  try {
    const entries = await outboxEntries(reopened);
    expect(entries.map((entry) => entry.id)).toEqual([input.id]);
    expect(readEntry(entries[0])?.payload.input).toEqual(input);
  } finally {
    reopened.close();
  }
  db = openOfflineDb(dbName);
});

test("[FR-036] a refusal while online is returned to the form and not kept", async () => {
  setOnline(true);
  fakeServer(fail("CONFLICT", "Not enough stock for this sale."));
  const reply = await runCommand("SALE", sale(), db);
  expect(reply).toEqual(fail("CONFLICT", "Not enough stock for this sale."));
  expect(await outboxEntries(db)).toEqual([]);
  expect(await catalogStock("p-bag")).toBe(10);
});

test("[SYNC-ORDER] commands made in the same millisecond still replay in the order they were made", async () => {
  const frozen = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(frozen);
  setOnline(false);
  const inputs = [sale(), restock(), sale(), restock()];
  for (const [index, input] of inputs.entries()) {
    await runCommand(index % 2 === 0 ? "SALE" : "RESTOCK", input as never, db);
  }
  const entries = await outboxEntries(db);
  expect(entries.map((entry) => entry.id)).toEqual(inputs.map((input) => input.id));
  expect(new Set(entries.map((entry) => entry.createdAt)).size).toBe(4);
  vi.mocked(Date.now).mockRestore();

  setOnline(true);
  fakeServer(ok({ replayed: false }));
  const report = await flushOutbox({ db });
  expect(sent.map((body) => body.input.id)).toEqual(inputs.map((input) => input.id));
  expect(report.synced).toHaveLength(4);
  expect(await outboxEntries(db)).toEqual([]);
});

test("[SYNC-ORDER] saving the same command again keeps one entry in its first place", async () => {
  setOnline(false);
  const first = sale();
  await runCommand("SALE", first, db);
  await runCommand("RESTOCK", restock(), db);
  await enqueue("SALE", first, ANA, db);
  const entries = await outboxEntries(db);
  expect(entries.map((entry) => entry.id)).toEqual([first.id, entries[1].id]);
  expect(entries).toHaveLength(2);
});

test("[FR-035] reconnecting replays every queued command and empties the outbox", async () => {
  setOnline(false);
  const inputs = [sale(), sale()];
  for (const input of inputs) await runCommand("SALE", input, db);

  setOnline(true);
  fakeServer(saleReply(inputs[0]), saleReply(inputs[1]));
  const report = await flushOutbox({ db });

  expect(report.stopped).toBeNull();
  expect(report.synced.map(({ kind }) => kind)).toEqual(["SALE", "SALE"]);
  expect(sent.map((body) => [body.kind, body.recordedBy, body.input.id])).toEqual([
    ["SALE", ANA.id, inputs[0].id],
    ["SALE", ANA.id, inputs[1].id],
  ]);
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-035] low-stock pop-ups owed by synced sales are collected", async () => {
  setOnline(false);
  const input = sale();
  await runCommand("SALE", input, db);
  setOnline(true);
  const alert = { productId: "p-bag", name: "Banig Bag", quantity: 2, threshold: 5 };
  fakeServer(ok({ ...(saleReply(input) as { data: object }).data, lowStockAlerts: [alert] }));
  expect(lowStockAlertsFrom(await flushOutbox({ db }))).toEqual([alert]);
});

test("[FR-036] a replay that loses the connection stops and keeps that command and every later one", async () => {
  setOnline(false);
  const inputs = [sale(), sale(), sale()];
  for (const input of inputs) await runCommand("SALE", input, db);

  setOnline(true);
  fakeServer(saleReply(inputs[0]), "network-error");
  const report = await flushOutbox({ db });

  expect(report.stopped).toBe("offline");
  expect(sent).toHaveLength(2);
  const left = await outboxEntries(db);
  expect(left.map((entry) => entry.id)).toEqual([inputs[1].id, inputs[2].id]);
  expect(left.map((entry) => entry.lastError)).toEqual([null, null]);

  // Next time it picks up where it left off.
  fakeServer(saleReply(inputs[1]), saleReply(inputs[2]));
  sent = [];
  await flushOutbox({ db });
  expect(sent.map((body) => body.input.id)).toEqual([inputs[1].id, inputs[2].id]);
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-036] a command the server refuses is kept with the reason, and the rest still sync", async () => {
  setOnline(false);
  const [refused, fine] = [sale(), sale()];
  await runCommand("SALE", refused, db);
  await runCommand("SALE", fine, db);

  setOnline(true);
  fakeServer(fail("CONFLICT", "Not enough stock for this sale."), saleReply(fine));
  const report = await flushOutbox({ db });

  expect(report.refused).toEqual([
    { summary: "Sale of ₱1,000.00 (2 items)", message: "Not enough stock for this sale." },
  ]);
  expect(report.synced).toHaveLength(1);
  const [kept] = await outboxEntries(db);
  expect(kept).toMatchObject({
    id: refused.id,
    attempts: 1,
    lastError: "Not enough stock for this sale.",
  });
  expect(readEntry(kept)?.payload.input).toEqual(refused);

  // Routine replays leave it alone; "Sync now" tries it again.
  sent = [];
  fakeServer(saleReply(refused));
  await flushOutbox({ db });
  expect(sent).toHaveLength(0);
  await flushOutbox({ db, includeRefused: true });
  expect(sent.map((body) => body.input.id)).toEqual([refused.id]);
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-036] an expired session stops the replay and keeps everything", async () => {
  setOnline(false);
  await runCommand("SALE", sale(), db);
  await runCommand("SALE", sale(), db);
  setOnline(true);
  fakeServer(fail("UNAUTHORIZED", "Please log in again."));
  const report = await flushOutbox({ db });
  expect(report.stopped).toBe("signed-out");
  expect(sent).toHaveLength(1);
  const left = await outboxEntries(db);
  expect(left).toHaveLength(2);
  expect(left.every((entry) => entry.lastError === null)).toBe(true);
});

test("[FR-036] a command waits for the user who recorded it; another user never sends it", async () => {
  setOnline(false);
  const anas = sale();
  await runCommand("SALE", anas, db);

  setSyncUser(BEN);
  setOnline(true);
  fakeServer(saleReply(anas));
  const report = await flushOutbox({ db });
  expect(sent).toHaveLength(0);
  expect(report.synced).toHaveLength(0);
  expect((await outboxEntries(db)).map((entry) => entry.id)).toEqual([anas.id]);

  setSyncUser(ANA);
  await flushOutbox({ db });
  expect(sent.map((body) => [body.recordedBy, body.input.id])).toEqual([[ANA.id, anas.id]]);
});

test("[FR-036] a replay whose answer was lost is sent again with the same id", async () => {
  setOnline(false);
  const input = sale();
  await runCommand("SALE", input, db);
  setOnline(true);
  // First attempt reached the server but the answer never came back.
  fakeServer("network-error");
  await flushOutbox({ db });
  fakeServer(saleReply(input, true));
  const report = await flushOutbox({ db });
  expect(sent.map((body) => body.input.id)).toEqual([input.id, input.id]);
  expect(report.synced[0].data).toMatchObject({ id: input.id, replayed: true });
  expect(await outboxEntries(db)).toEqual([]);
});

test("[FR-049] input the server would reject is refused on the device, never queued", async () => {
  setOnline(false);
  const fetchMock = fakeServer("network-error");
  const reply = await runCommand("RESTOCK", restock({ quantity: Number.NaN }), db);
  expect(reply.ok).toBe(false);
  expect(!reply.ok && reply.error.code).toBe("VALIDATION");
  expect(!reply.ok && reply.error.fieldErrors?.quantity).toBeTruthy();
  expect(await outboxEntries(db)).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("[FR-049] only sales, refunds, and restocks can be queued", async () => {
  setOnline(false);
  const fetchMock = fakeServer("network-error");
  // A product edit is not a command: the type system and the runtime both refuse it.
  // @ts-expect-error PRODUCT_UPDATE is not an offline-capable command
  const reply = await runCommand("PRODUCT_UPDATE", { id: randomUUID(), name: "Tote" }, db);
  expect(reply).toEqual(
    fail("VALIDATION", "Only sales, refunds, and restocks can be saved offline."),
  );
  expect(await outboxEntries(db)).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("[FR-034] without a signed-in user or IndexedDB, a command is just sent online", async () => {
  setSyncUser(null);
  setOnline(true);
  fakeServer("network-error");
  const reply = await runCommand("SALE", sale(), db);
  expect(reply).toEqual(
    fail("OFFLINE", "Couldn't reach the server. Check your connection and try again."),
  );
  expect(sent[0].recordedBy).toBeNull();
  expect(await outboxEntries(db)).toEqual([]);
});
