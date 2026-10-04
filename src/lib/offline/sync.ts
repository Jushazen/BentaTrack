// Sending offline-capable commands and replaying the outbox (FR-034–036, FR-049, §3.4). Leaf 6.2.
// runCommand() is how every form that changes data saves: sales, refunds, and restocks (leaf
// 6.2), and products, categories, and suppliers (leaf 9.4). The command is written to the outbox
// first, then sent to /api/sync. No answer (offline, timeout, server down) leaves it queued; any
// answer settles it. flushOutbox() later sends what is queued, oldest first. Every command
// carries its client-generated UUID, so sending one twice never applies it twice.
// A change that needs something still waiting in the outbox (a refund of an unsynced sale, a
// product in a category added offline) waits behind it, so the server gets them in order.
// Browser only.
import type { LowStockAlert } from "@/components/layout/low-stock-alerts";
import {
  createCategorySchema,
  deleteCategorySchema,
  renameCategorySchema,
} from "@/features/categories/schemas";
import { restockSchema } from "@/features/inventory/schemas";
import {
  createProductSchema,
  dataUrlToFile,
  productIdSchema,
  updateProductSchema,
  type ProductCommand,
} from "@/features/products/schemas";
import { refundSaleSchema } from "@/features/refunds/schemas";
import { recordSaleSchema } from "@/features/sales/schemas";
import {
  createSupplierSchema,
  deleteSupplierSchema,
  updateSupplierSchema,
} from "@/features/suppliers/schemas";
import { can } from "@/lib/permissions";
import { fail, invalid, ok, type ErrorCode, type Result } from "@/lib/result";
import { forgetSnapshotCursor } from "./catalog";
import { offlineDb, type OfflineDb } from "./db";
import {
  applyToDevice,
  checkOnDevice,
  COMMAND_CAPABILITY,
  COMMAND_KINDS,
  commandIdOf,
  countAttempt,
  enqueue,
  markRefused,
  outboxEntries,
  readEntry,
  removeEntry,
  waitsBehind,
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
/** Dispatched on window when a change is queued, so the sync indicator sends it when it can. */
export const OUTBOX_QUEUED_EVENT = "bentatrack:outbox-queued";
/** Same rule as isCommandId() in src/lib/commands.ts, which only the server can load. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Queued = { queued: true };
export type Sent<K extends CommandKind> = CommandResults[K] & { queued: false };
/** What a form gets back: the server's answer, or word that it was saved to sync later. */
export type CommandReply<K extends CommandKind> = Result<Sent<K> | Queued>;

type Issues = readonly { path: readonly PropertyKey[]; message: string }[];

/** A product command as the form object its schema parses, with the photo as a File again. */
function productForm(command: ProductCommand, extra: Record<string, unknown> = {}) {
  const image = command.image ? dataUrlToFile(command.image) : undefined;
  return { ...command.fields, ...extra, id: command.id, occurredAt: command.occurredAt, image };
}

/**
 * The same schemas the server parses with, so a bad entry is caught before it is queued. Each
 * returns the problems, or null when there are none.
 */
const VALIDATORS: { [K in CommandKind]: (input: CommandInputs[K]) => Issues | null } = {
  SALE: (input) => recordSaleSchema.safeParse(input).error?.issues ?? null,
  REFUND: (input) => refundSaleSchema.safeParse(input).error?.issues ?? null,
  RESTOCK: (input) => restockSchema.safeParse(input).error?.issues ?? null,
  PRODUCT_CREATE: (input) =>
    createProductSchema.safeParse(productForm(input)).error?.issues ?? null,
  PRODUCT_UPDATE: (input) =>
    updateProductSchema.safeParse(productForm(input, { commandId: input.commandId })).error
      ?.issues ?? null,
  PRODUCT_ARCHIVE: (input) => productIdSchema.safeParse(input).error?.issues ?? null,
  PRODUCT_RESTORE: (input) => productIdSchema.safeParse(input).error?.issues ?? null,
  CATEGORY_CREATE: (input) => createCategorySchema.safeParse(input).error?.issues ?? null,
  CATEGORY_RENAME: (input) => renameCategorySchema.safeParse(input).error?.issues ?? null,
  CATEGORY_DELETE: (input) => deleteCategorySchema.safeParse(input).error?.issues ?? null,
  SUPPLIER_CREATE: (input) => createSupplierSchema.safeParse(input).error?.issues ?? null,
  SUPPLIER_UPDATE: (input) => updateSupplierSchema.safeParse(input).error?.issues ?? null,
  SUPPLIER_DELETE: (input) => deleteSupplierSchema.safeParse(input).error?.issues ?? null,
};

/** What the server would refuse for the signed-in role (FR-032); null if it is allowed. */
function forbiddenFor<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  user: SyncUser | null,
): Result<never> | null {
  if (!user?.role) return null;
  if (!can(user.role, COMMAND_CAPABILITY[kind])) {
    return fail("FORBIDDEN", "You don't have access to that.");
  }
  if (kind === "PRODUCT_CREATE" || kind === "PRODUCT_UPDATE") {
    const { fields } = input as ProductCommand;
    if (fields.purchasePrice !== undefined && !can(user.role, "products.cost")) {
      return fail("FORBIDDEN", "Only the owner can set purchase prices.");
    }
    if (fields.supplierId !== undefined && !can(user.role, "suppliers.read")) {
      return fail("FORBIDDEN", "Only the owner can set a product's supplier.");
    }
  }
  return null;
}

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

async function waitsInLine<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb,
): Promise<boolean> {
  try {
    return await waitsBehind(kind, input, db);
  } catch {
    return false;
  }
}

function announceQueued(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_QUEUED_EVENT));
}

/**
 * Saves any change (FR-034, FR-049). Input the server would reject is refused here first, even
 * offline, and so is a change the signed-in role may not make. Online, the reply is the server's
 * answer. Without one, the command stays on this device, is applied to the device store, and the
 * reply is `{ queued: true }`. If the outbox can't be used (no IndexedDB, nobody signed in), it
 * behaves like a plain online call.
 */
export async function runCommand<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb = offlineDb(),
): Promise<CommandReply<K>> {
  // Guards plain-JS callers too: nothing but a known kind is ever queued.
  if (!(COMMAND_KINDS as readonly string[]).includes(kind)) {
    return fail("VALIDATION", "This change can't be saved offline.");
  }
  const issues = VALIDATORS[kind](input);
  if (issues) return invalid(issues);
  const id = commandIdOf(input) ?? "";
  if (!UUID.test(id)) {
    return fail("VALIDATION", "This change is missing its id. Reload and try again.");
  }
  const user = currentUser;
  const forbidden = forbiddenFor(kind, input, user);
  if (forbidden) return forbidden;

  let saved = false;
  if (user) {
    try {
      await enqueue(kind, input, user, db);
      saved = true;
    } catch {
      saved = false;
    }
  }

  // Behind a change it needs while online: send the queue now, in order, and answer for this one.
  if (saved && navigator.onLine && (await waitsInLine(kind, input, db))) {
    const answer = await sendInLine(id, db);
    if (answer) {
      await quietly(removeEntry(id, db));
      if (!answer.ok) return answer;
      await quietly(applyToDevice(kind, input, db));
      return ok({ ...(answer.data as CommandResults[K]), queued: false });
    }
  }

  // Offline, or the queue ahead of it couldn't be sent: it waits on the device and the replay
  // sends it in order (FR-049). What the device knows would make the server refuse it is refused
  // now. A refund of a sale that is still waiting stays behind it (leaf 9.3).
  if (saved && (!navigator.onLine || (await waitsInLine(kind, input, db)))) {
    const problem = await checkOnDevice(kind, input, db).catch(() => null);
    if (problem) {
      await quietly(removeEntry(id, db));
      return problem;
    }
    await quietly(applyToDevice(kind, input, db));
    announceQueued();
    return ok({ queued: true });
  }

  inFlight.add(id);
  try {
    const result = await sendCommand(kind, input, user?.id ?? null);
    if (result === null) {
      if (!saved) return fail("OFFLINE", OFFLINE_MESSAGE);
      await quietly(countAttempt(id, db));
      await quietly(applyToDevice(kind, input, db));
      announceQueued();
      return ok({ queued: true });
    }
    // Answered either way: the form shows a refusal, so it needn't wait in the outbox.
    if (saved) await quietly(removeEntry(id, db));
    if (!result.ok) return result;
    const data = result.data as CommandResults[K];
    // The device mirrors the server until its next download of fresh data.
    await quietly(applyToDevice(kind, input, db));
    return ok({ ...data, queued: false });
  } finally {
    inFlight.delete(id);
  }
}

export type FlushReport = {
  /** Commands the server applied (or had already applied), in the order sent. */
  synced: { kind: CommandKind; data: unknown }[];
  /** Commands the server refused; they stay in the outbox with the reason. */
  refused: { summary: string; message: string }[];
  /** Why the replay stopped early, leaving the rest queued. */
  stopped: null | "offline" | "signed-out";
  /** The server's answer for each command it answered, by command id. */
  answers: Record<string, Result<unknown>>;
};

async function flush(includeRefused: boolean, db: OfflineDb): Promise<FlushReport> {
  const report: FlushReport = { synced: [], refused: [], stopped: null, answers: {} };
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
    report.answers[entry.id] = result;
    if (result.ok) {
      await removeEntry(entry.id, db);
      report.synced.push({ kind: entry.kind, data: result.data });
    } else {
      await markRefused(entry.id, result.error.message, db);
      report.refused.push({ summary: entry.payload.summary, message: result.error.message });
    }
  }
  // The device still shows what the refused changes did; the next download replaces all of it.
  if (report.refused.length > 0) await forgetSnapshotCursor(db);
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

/**
 * Replays the outbox so command `id` goes after the changes it waits for, and returns the
 * server's answer for it, or null if it couldn't be sent. A replay already running may have
 * started before `id` was queued, so a second one follows if needed.
 */
async function sendInLine(id: string, db: OfflineDb): Promise<Result<unknown> | null> {
  for (let round = 0; round < 2; round++) {
    let report: FlushReport;
    try {
      report = await flushOutbox({ db });
    } catch {
      return null;
    }
    announceQueued();
    const answer = report.answers[id];
    if (answer) return answer;
    if (report.stopped) return null;
  }
  return null;
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
