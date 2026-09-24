import { beforeEach, expect, test } from "vitest";
import { db } from "@/lib/db";
import { recordInventoryChange } from "@/lib/inventory-log";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

beforeEach(resetTestDatabase);

test("[FR-010] each change is logged with its date and time", async () => {
  const user = await makeUser("STAFF");
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId, { stockQuantity: 4 });
  const occurredAt = new Date("2026-09-24T02:15:30.000Z");

  const change = await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { stockQuantity: { increment: 6 } },
    });
    return recordInventoryChange(tx, {
      productId: product.id,
      type: "RESTOCK",
      quantityChange: 6,
      userId: user.id,
      occurredAt,
      note: "Delivery from supplier",
    });
  });

  expect(change.occurredAt.toISOString()).toBe(occurredAt.toISOString());
  expect(change.recordedAt).toBeInstanceOf(Date);
  expect(change.note).toBe("Delivery from supplier");
});

test("[FR-011] each change records the product, the user, the amount, and the stock after", async () => {
  const user = await makeUser("OWNER");
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId, {
    name: "Silk Scarf",
    code: "ACC-7",
    stockQuantity: 4,
  });

  const change = await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { stockQuantity: { decrement: 3 } },
    });
    return recordInventoryChange(tx, {
      productId: product.id,
      type: "REMOVAL",
      quantityChange: -3,
      userId: user.id,
      occurredAt: new Date(),
    });
  });

  expect(change).toMatchObject({
    productId: product.id,
    productName: "Silk Scarf",
    productCode: "ACC-7",
    type: "REMOVAL",
    quantityChange: -3,
    stockAfter: 1,
    userId: user.id,
  });
});

test("[FR-010] a failed transaction leaves neither the stock change nor the log", async () => {
  const user = await makeUser("STAFF");
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId, { stockQuantity: 2 });

  await expect(
    db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: { stockQuantity: { decrement: 1 } },
      });
      await recordInventoryChange(tx, {
        productId: product.id,
        type: "SALE",
        quantityChange: -1,
        userId: user.id,
        occurredAt: new Date(),
      });
      throw new Error("simulated failure after logging");
    }),
  ).rejects.toThrow("simulated failure");

  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(2);
  expect(await db.inventoryChange.count()).toBe(0);
});
