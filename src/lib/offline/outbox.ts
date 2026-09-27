// Outbox: sales, refunds, and restocks saved on this device until the server has them
// (FR-034–036, §5.3 "saved on the device first"). Leaf 6.2.
// An entry is written before the command is sent and removed only once the server has answered,
// so closing the tab or losing the connection mid-request can't lose it. Entries keep the user who
// recorded them, so a later sign-in by someone else never syncs them under the wrong name (§5.2).
// Browser only.
import type { RestockResult } from "@/features/inventory/actions";
import type { RestockInput } from "@/features/inventory/schemas";
import type { RefundResult } from "@/features/refunds/actions";
import type { RefundSaleInput } from "@/features/refunds/schemas";
import type { SaleResult } from "@/features/sales/actions";
import { saleTotals } from "@/features/sales/cart";
import type { RecordSaleInput } from "@/features/sales/schemas";
import { formatPeso } from "@/lib/money";
import { offlineDb, type OfflineDb, type OutboxEntry, type OutboxKind } from "./db";

export type CommandKind = OutboxKind;
export const COMMAND_KINDS = ["SALE", "REFUND", "RESTOCK"] as const satisfies CommandKind[];

export type CommandInputs = {
  SALE: RecordSaleInput;
  REFUND: RefundSaleInput;
  RESTOCK: RestockInput;
};

export type CommandResults = {
  SALE: SaleResult;
  REFUND: RefundResult;
  RESTOCK: RestockResult;
};

/** Who is signed in on this device. */
export type SyncUser = { id: string; name: string };

/** What an outbox entry's `payload` holds. */
export type OutboxPayload<K extends CommandKind = CommandKind> = {
  userId: string;
  userName: string;
  /** One line for the "Waiting to sync" list, e.g. "Sale of ₱1,250.00 (3 items)". */
  summary: string;
  input: CommandInputs[K];
};

/** An outbox entry with its payload checked. */
export type QueuedCommand<K extends CommandKind = CommandKind> = Omit<
  OutboxEntry,
  "kind" | "payload"
> & { kind: K; payload: OutboxPayload<K> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The entry with a typed payload, or null if it isn't one this version understands. */
export function readEntry(entry: OutboxEntry): QueuedCommand | null {
  const payload = entry.payload;
  if (!(COMMAND_KINDS as readonly string[]).includes(entry.kind)) return null;
  if (
    !isRecord(payload) ||
    typeof payload.userId !== "string" ||
    typeof payload.userName !== "string" ||
    typeof payload.summary !== "string" ||
    !isRecord(payload.input) ||
    payload.input.id !== entry.id
  ) {
    return null;
  }
  return entry as QueuedCommand;
}

function units(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

async function describe<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb,
): Promise<string> {
  if (kind === "SALE") {
    const sale = input as RecordSaleInput;
    const totals = saleTotals(sale.items, sale.discount ?? null);
    const count = sale.items.reduce((sum, item) => sum + item.quantity, 0);
    return `Sale of ${formatPeso(totals.total)} (${units(count)})`;
  }
  if (kind === "REFUND") {
    const refund = input as RefundSaleInput;
    return `Refund of ${units(refund.items.reduce((sum, item) => sum + item.quantity, 0))}`;
  }
  const restock = input as RestockInput;
  const product = await db.products.get(restock.productId);
  return `Restock of ${restock.quantity} × ${product?.name ?? "a product"}`;
}

/**
 * Saves a command in the outbox, after every entry already there. Saving the same command id
 * again keeps the first entry (and its place in line).
 */
export async function enqueue<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  user: SyncUser,
  db: OfflineDb = offlineDb(),
): Promise<QueuedCommand<K>> {
  const summary = await describe(kind, input, db);
  return db.transaction("rw", db.outbox, async () => {
    const existing = await db.outbox.get(input.id);
    if (existing) return existing as QueuedCommand<K>;
    // Strictly increasing, so two commands in the same millisecond still replay in order.
    const last = await db.outbox.orderBy("createdAt").last();
    const entry: QueuedCommand<K> = {
      id: input.id,
      kind,
      payload: { userId: user.id, userName: user.name, summary, input },
      createdAt: Math.max(Date.now(), (last?.createdAt ?? 0) + 1),
      attempts: 0,
      lastError: null,
    };
    await db.outbox.add(entry);
    return entry;
  });
}

/** Every entry, oldest first. */
export async function outboxEntries(db: OfflineDb = offlineDb()): Promise<OutboxEntry[]> {
  return db.outbox.orderBy("createdAt").toArray();
}

/** Removes an entry once the server has answered for it (or the user discarded it). */
export async function removeEntry(id: string, db: OfflineDb = offlineDb()): Promise<void> {
  await db.outbox.delete(id);
}

/** Keeps an entry the server refused, with the reason, so it is never silently dropped. */
export async function markRefused(
  id: string,
  message: string,
  db: OfflineDb = offlineDb(),
): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    const entry = await db.outbox.get(id);
    if (entry) await db.outbox.put({ ...entry, attempts: entry.attempts + 1, lastError: message });
  });
}

/** Counts attempt `id` that didn't reach the server; the entry stays as it was otherwise. */
export async function countAttempt(id: string, db: OfflineDb = offlineDb()): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    const entry = await db.outbox.get(id);
    if (entry) await db.outbox.put({ ...entry, attempts: entry.attempts + 1 });
  });
}

/**
 * Moves the device's catalog stock the way `kind` moves the server's, so the next offline sale
 * sees what is really left. Refunds are left to the next catalog refresh: they name sale lines,
 * not products. Never below zero; products not in the catalog are skipped.
 */
export async function applyToCatalog<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb = offlineDb(),
): Promise<void> {
  const deltas: [string, number][] =
    kind === "SALE"
      ? (input as RecordSaleInput).items.map((item) => [item.productId, -item.quantity])
      : kind === "RESTOCK"
        ? [[(input as RestockInput).productId, (input as RestockInput).quantity]]
        : [];
  if (deltas.length === 0) return;
  await db.transaction("rw", db.products, async () => {
    for (const [productId, delta] of deltas) {
      const product = await db.products.get(productId);
      if (!product || !Number.isFinite(delta)) continue;
      await db.products.put({
        ...product,
        stockQuantity: Math.max(0, product.stockQuantity + delta),
      });
    }
  });
}
