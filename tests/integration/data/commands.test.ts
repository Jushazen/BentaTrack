import { randomUUID } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import type { Tx } from "@/lib/db";
import { db } from "@/lib/db";
import { recordInventoryChange } from "@/lib/inventory-log";
import { isCommandId, runIdempotent } from "@/lib/commands";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

beforeEach(resetTestDatabase);

/** A dummy "restock" command keyed by its InventoryChange id, as real commands will be. */
function restockCommand(id: string, productId: string, userId: string, qty: number) {
  return {
    id,
    findExisting: async (tx: Tx, changeId: string) => {
      const row = await tx.inventoryChange.findUnique({ where: { id: changeId } });
      return row ? { stockAfter: row.stockAfter } : null;
    },
    apply: async (tx: Tx, changeId: string) => {
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: { increment: qty } },
      });
      const row = await recordInventoryChange(tx, {
        id: changeId,
        productId,
        type: "RESTOCK",
        quantityChange: qty,
        userId,
        occurredAt: new Date(),
      });
      return { stockAfter: row.stockAfter };
    },
  };
}

async function setup() {
  const user = await makeUser("STAFF");
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId, { stockQuantity: 10 });
  return { user, product };
}

test("[CMD-1] replaying a command with the same id applies it only once", async () => {
  const { user, product } = await setup();
  const id = randomUUID();

  const first = await runIdempotent(restockCommand(id, product.id, user.id, 5));
  const second = await runIdempotent(restockCommand(id, product.id, user.id, 5));

  expect(first).toEqual({ replayed: false, result: { stockAfter: 15 } });
  expect(second).toEqual({ replayed: true, result: { stockAfter: 15 } });
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(
    15,
  );
  expect(await db.inventoryChange.count()).toBe(1);
});

test("[CMD-1] two copies of the same command sent at once still apply only once", async () => {
  const { user, product } = await setup();
  const id = randomUUID();

  const results = await Promise.all(
    Array.from({ length: 4 }, () => runIdempotent(restockCommand(id, product.id, user.id, 5))),
  );

  expect(results.filter((r) => !r.replayed)).toHaveLength(1);
  expect(results.every((r) => r.result.stockAfter === 15)).toBe(true);
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(
    15,
  );
  expect(await db.inventoryChange.count()).toBe(1);
});

test("[CMD-1] different ids apply separately, and non-UUID ids are rejected", async () => {
  const { user, product } = await setup();
  await runIdempotent(restockCommand(randomUUID(), product.id, user.id, 1));
  await runIdempotent(restockCommand(randomUUID(), product.id, user.id, 1));
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(
    12,
  );

  expect(isCommandId("not-a-uuid")).toBe(false);
  await expect(runIdempotent(restockCommand("abc", product.id, user.id, 1))).rejects.toThrow(
    /UUID/,
  );
});
