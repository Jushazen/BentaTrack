// Sending offline-capable commands and replaying the outbox (FR-034–036, FR-049, §3.4). Leaf 6.2.
// runCommand() is how the checkout, refund, and restock forms save: the command is written to
// the outbox first, then sent to /api/sync. No answer (offline, timeout, server down) leaves it
// queued; any answer settles it. flushOutbox() later sends what is queued, oldest first. Every
// command carries its client-generated UUID, so sending one twice never applies it twice.
// Only sales, refunds, and restocks go through here; every other edit needs a connection.
// A refund of a sale that hasn't synced yet always waits in the outbox behind it (leaf 9.3).
// Browser only.
import type { LowStockAlert } from "@/components/layout/low-stock-alerts";
import { restockSchema } from "@/features/inventory/schemas";
import { refundSaleSchema } from "@/features/refunds/schemas";
import { recordSaleSchema } from "@/features/sales/schemas";
import { fail, invalid, ok, type ErrorCode, type Result } from "@/lib/result";
import { offlineDb, type OfflineDb } from "./db";
import {
  applyToCatalog,
  countAttempt,
  enqueue,
  markRefused,
  outboxEntries,
  readEntry,
  removeEntry,
  type CommandInputs,
  type CommandKind,
  type CommandResults,
  type SyncUser,
} from "./outbox";

export const SYNC_URL = "/api/sync";
/** A reply slower than this counts as no reply; the entry stays queued and is resent later. */
const SEND_TIMEOUT_MS = 20_000;
const OFFLINE_MESSAGE = "Couldn't reach the server. Check your connection and try again.";
/** Serializes outbox replays across this device's open tabs. */
const LOCK_NAME = "bentatrack-outbox";

export type Queued = { queued: true };
export type Sent<K extends CommandKind> = CommandResults[K] & { queued: false };
/** What a form gets back: the server's answer, or word that it was saved to sync later. */
export type CommandReply<K extends CommandKind> = Result<Sent<K> | Queued>;

/** The same schemas the server parses with, so a bad entry is caught before it is queued. */
const SCHEMAS = { SALE: recordSaleSchema, REFUND: refundSaleSchema, RESTOCK: restockSchema };

let currentUser: SyncUser | null = null;
/** Entries being sent by runCommand right now; a replay leaves them alone. */
const inFlight = new Set<string>();

/** Set by the signed-in shell. Commands are queued under this user and only they replay them. */
export function setSyncUser(user: SyncUser | null): void {
  currentUser = user;
}

export function syncUser(): SyncUser | null {
  return currentUser;
}

const ERROR_CODES: readonly ErrorCode[] = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "OFFLINE",
];

function isResult(value: unknown): value is Result<unknown> {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  if (value.ok === true) return "data" in value;
  if (value.ok !== false || !("error" in value)) return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    ERROR_CODES.includes(error.code as ErrorCode) &&
    typeof error.message === "string"
  );
}

/**
 * Sends one command to the server. Returns its Result, or null when there was no usable answer
 * (no connection, timeout, server error), in which case it may or may not have been applied.
 */
export async function sendCommand<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  recordedBy: string | null,
): Promise<Result<unknown> | null> {
  let response: Response;
  try {
    response = await fetch(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, recordedBy, input }),
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  // A sign-in page instead of JSON means the session is gone.
  if (response.redirected && new URL(response.url).pathname === "/login") {
    return fail("UNAUTHORIZED", "Please log in again.");
  }
  if (response.status >= 500) return null;
  try {
    const body: unknown = await response.json();
    return isResult(body) ? body : null;
  } catch {
    return null;
  }
}

async function quietly(work: Promise<unknown>): Promise<void> {
  try {
    await work;
  } catch {
    // The device store failed; the server's answer still stands.
  }
}

/** True for a refund whose sale is still in the outbox. */
async function waitsForItsSale<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb,
): Promise<boolean> {
  if (kind !== "REFUND") return false;
  try {
    const sale = await db.outbox.get((input as CommandInputs["REFUND"]).saleId);
    return sale?.kind === "SALE";
  } catch {
    return false;
  }
}

/**
 * Saves a sale, refund, or restock (FR-034). Input the server would reject is refused here
 * first, even offline. Online, the reply is the server's answer. Without one, the command stays
 * on this device and the reply is `{ queued: true }`. If the outbox can't be used (no IndexedDB,
 * nobody signed in), it behaves like a plain online call.
 */
export async function runCommand<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb = offlineDb(),
): Promise<CommandReply<K>> {
  // Guards plain-JS callers too: nothing but these three kinds is ever queued (FR-049).
  if (!Object.hasOwn(SCHEMAS, kind)) {
    return fail("VALIDATION", "Only sales, refunds, and restocks can be saved offline.");
  }
  const checked = SCHEMAS[kind].safeParse(input);
  if (!checked.success) return invalid(checked.error.issues);

  const user = currentUser;
  let saved = false;
  if (user) {
    try {
      await enqueue(kind, input, user, db);
      saved = true;
    } catch {
      saved = false;
    }
  }

  // A refund of a sale still waiting to sync waits behind it: the replay sends the sale first,
  // so the server knows the sale when the refund arrives (FR-049, leaf 9.3).
  if (saved && (!navigator.onLine || (await waitsForItsSale(kind, input, db)))) {
    await quietly(applyToCatalog(kind, input, db));
    return ok({ queued: true });
  }

  inFlight.add(input.id);
  try {
    const result = await sendCommand(kind, input, user?.id ?? null);
    if (result === null) {
      if (!saved) return fail("OFFLINE", OFFLINE_MESSAGE);
      await quietly(countAttempt(input.id, db));
      await quietly(applyToCatalog(kind, input, db));
      return ok({ queued: true });
    }
    // Answered either way: the form shows a refusal, so it needn't wait in the outbox.
    if (saved) await quietly(removeEntry(input.id, db));
    if (!result.ok) return result;
    const data = result.data as CommandResults[K];
    await quietly(applyToCatalog(kind, input, db));
    return ok({ ...data, queued: false });
  } finally {
    inFlight.delete(input.id);
  }
}

export type FlushReport = {
  /** Commands the server applied (or had already applied), in the order sent. */
  synced: { kind: CommandKind; data: unknown }[];
  /** Commands the server refused; they stay in the outbox with the reason. */
  refused: { summary: string; message: string }[];
  /** Why the replay stopped early, leaving the rest queued. */
  stopped: null | "offline" | "signed-out";
};

async function flush(includeRefused: boolean, db: OfflineDb): Promise<FlushReport> {
  const report: FlushReport = { synced: [], refused: [], stopped: null };
  const user = currentUser;
  if (!user) return report;

  for (const raw of await outboxEntries(db)) {
    const entry = readEntry(raw);
    if (!entry) {
      if (raw.lastError === null) {
        await markRefused(raw.id, "This change can't be read. Discard it and record it again.", db);
      }
      continue;
    }
    // Only the person who recorded it may send it (§5.2); it waits for them to sign in.
    if (entry.payload.userId !== user.id) continue;
    if (entry.lastError !== null && !includeRefused) continue;
    if (inFlight.has(entry.id)) continue;

    const result = await sendCommand(entry.kind, entry.payload.input, user.id);
    if (result === null) {
      await countAttempt(entry.id, db);
      report.stopped = "offline";
      break;
    }
    if (!result.ok && result.error.code === "UNAUTHORIZED") {
      report.stopped = "signed-out";
      break;
    }
    if (result.ok) {
      await removeEntry(entry.id, db);
      report.synced.push({ kind: entry.kind, data: result.data });
    } else {
      await markRefused(entry.id, result.error.message, db);
      report.refused.push({ summary: entry.payload.summary, message: result.error.message });
    }
  }
  return report;
}

async function withDeviceLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return work();
  return locks.request(LOCK_NAME, work);
}

let running: Promise<FlushReport> | null = null;

/**
 * Sends the signed-in user's queued commands, oldest first (FR-035). Stops at the first one
 * that gets no answer, keeping it and everything after it. Refused commands are kept with their
 * reason and skipped next time unless `includeRefused` (the user's "Sync now") asks to retry.
 * Only one replay runs at a time; a routine call during one shares its result.
 */
export function flushOutbox(
  options: { includeRefused?: boolean; db?: OfflineDb } = {},
): Promise<FlushReport> {
  const { includeRefused = false, db = offlineDb() } = options;
  if (running && !includeRefused) return running;
  const previous = running;
  const next: Promise<FlushReport> = (async () => {
    if (previous) await previous.catch(() => undefined);
    return withDeviceLock(() => flush(includeRefused, db));
  })().finally(() => {
    if (running === next) running = null;
  });
  running = next;
  return next;
}

/** Low-stock pop-ups owed for sales that just synced (FR-008). */
export function lowStockAlertsFrom(report: FlushReport): LowStockAlert[] {
  const alerts = new Map<string, LowStockAlert>();
  for (const { kind, data } of report.synced) {
    if (kind !== "SALE") continue;
    for (const alert of (data as CommandResults["SALE"]).lowStockAlerts ?? []) {
      alerts.set(alert.productId, alert);
    }
  }
  return [...alerts.values()];
}
