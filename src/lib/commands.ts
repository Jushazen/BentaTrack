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

/**
 * Runs `apply` at most once per id. Uses a serializable transaction, and if two copies of
 * the same command race, the loser's unique-key violation is resolved by returning the
 * winner's result.
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
  try {
    return await attempt();
  } catch (err) {
    if (isRetryable(err)) {
      const existing = await db.$transaction((tx) => command.findExisting(tx, command.id));
      if (existing !== null) return { replayed: true, result: existing };
      return attempt();
    }
    throw err;
  }
}

function isRetryable(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2002" || err.code === "P2034")
  );
}
