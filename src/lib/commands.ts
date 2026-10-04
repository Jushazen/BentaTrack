// Idempotent commands: the safety mechanism behind offline replay (FR-036).
// A command carries a client-generated UUID. If a record with that id already exists,
// the command was applied before, so its original result is returned instead of re-applying.
// Checkout (4.1), refunds (4.2), and restock (3.4) plug into this; the outbox (6.2) replays them.
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";

export type CommandOutcome<T> = { replayed: boolean; result: T };

type IdempotentCommand<T> = {
  /** Client-generated UUID; also the primary key of the record the command creates. */
  id: string;
  /** Returns the earlier result if a record with this id exists, else null. */
  findExisting: (tx: Tx, id: string) => Promise<T | null>;
  /** Applies the command. Must create the record keyed by `id` in the same transaction. */
  apply: (tx: Tx, id: string) => Promise<T>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCommandId(id: string): boolean {
  return UUID.test(id);
}

/** Busy products (two tills selling the same item) can conflict a few times in a row. */
const MAX_ATTEMPTS = 5;

/**
 * Runs `apply` at most once per id. Uses a serializable transaction, and if two copies of
 * the same command race, the loser's unique-key violation is resolved by returning the
 * winner's result. Different commands that conflict (e.g. two sales of one product) are retried.
 */
export async function runIdempotent<T>(command: IdempotentCommand<T>): Promise<CommandOutcome<T>> {
  if (!isCommandId(command.id)) throw new Error("command id must be a UUID");
  const attempt = () =>
    db.$transaction(
      async (tx) => {
        const existing = await command.findExisting(tx, command.id);
        if (existing !== null) return { replayed: true, result: existing };
        return { replayed: false, result: await command.apply(tx, command.id) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (err) {
      if (!isRetryable(err) || tries >= MAX_ATTEMPTS) throw err;
      const existing = await db.$transaction((tx) => command.findExisting(tx, command.id));
      if (existing !== null) return { replayed: true, result: existing };
      // Short random pause so the conflicting transactions don't collide again in lockstep.
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20 * tries));
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === "P2002" || err.code === "P2034") return true;
  // A serialization failure or deadlock inside a raw query (e.g. SELECT … FOR UPDATE) arrives
  // as P2010 with the Postgres SQLSTATE on the driver adapter's cause.
  const meta = err.meta as
    { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  const sqlState = meta?.driverAdapterError?.cause?.originalCode;
  return sqlState === "40001" || sqlState === "40P01";
}

// ---- Receipts (leaf 9.4) --------------------------------------------------------------
// Product, category, and supplier changes don't create a record keyed by the command id (an
// edit, a rename, a delete), so each writes a CommandReceipt instead, in the same transaction.

/** The earlier result of command `id`, or null if it was never applied. */
export async function findReceipt<T>(id: string | undefined, tx: Tx = db): Promise<T | null> {
  if (!id) return null;
  const receipt = await tx.commandReceipt.findUnique({ where: { id }, select: { result: true } });
  return receipt ? (receipt.result as T) : null;
}

/**
 * Runs `work` in a transaction. With a command id it runs at most once: the result is stored in
 * a receipt keyed by the id, and a replay gets that result back. Without one (a direct call that
 * didn't come from a device) it simply runs. `work` may throw to roll back; no receipt is kept
 * then, so a refused change can be retried later.
 */
export async function runWithReceipt<T>(
  commandId: string | undefined,
  kind: string,
  userId: string,
  work: (tx: Tx) => Promise<T>,
): Promise<CommandOutcome<T>> {
  if (!commandId) return { replayed: false, result: await db.$transaction(work) };
  return runIdempotent({
    id: commandId,
    findExisting: (tx, id) => findReceipt<T>(id, tx),
    apply: async (tx, id) => {
      const result = await work(tx);
      await tx.commandReceipt.create({
        data: { id, kind, userId, result: result as Prisma.InputJsonValue },
      });
      return result;
    },
  });
}
