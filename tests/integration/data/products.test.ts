import { randomUUID } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import { db } from "@/lib/db";
import { recordInventoryChange } from "@/lib/inventory-log";
import { stockStatus } from "@/lib/stock-status";
import { makeCategory, makeProduct, makeUser, resetTestDatabase } from "../helpers/db";

beforeEach(resetTestDatabase);

test("[FR-002] a product stores every SRS field", async () => {
  const category = await makeCategory("Bags");
  const supplier = await db.supplier.create({
    data: { name: "Manila Leather Co.", phone: "0917" },
  });
  const product = await db.product.create({
    data: {
      name: "Tote Bag",
      code: "BAG-001",
      barcode: "4800016123457",
      categoryId: category.id,
      brand: "Estetika",
      supplierId: supplier.id,
      purchasePrice: 45_000,
      sellingPrice: 89_950,
      stockQuantity: 12,
      lowStockThreshold: 3,
      expirationDate: new Date("2027-06-30"),
      imageUrl: "https://example.test/tote.jpg",
    },
    include: { category: true, supplier: true },
  });
  expect(product).toMatchObject({
    name: "Tote Bag",
    code: "BAG-001",
    barcode: "4800016123457",
    brand: "Estetika",
    purchasePrice: 45_000,
    sellingPrice: 89_950,
    stockQuantity: 12,
    lowStockThreshold: 3,
    imageUrl: "https://example.test/tote.jpg",
  });
  expect(product.category.name).toBe("Bags");
  expect(product.supplier?.name).toBe("Manila Leather Co.");
  expect(product.expirationDate?.toISOString().slice(0, 10)).toBe("2027-06-30");
  expect(product.createdAt).toBeInstanceOf(Date); // "date added"
});

test("[FR-002] product code is unique; barcode is optional but unique when given", async () => {
  const { id: categoryId } = await makeCategory();
  await makeProduct(categoryId, { code: "DUP-1", barcode: "111" });
  await expect(makeProduct(categoryId, { code: "DUP-1" })).rejects.toMatchObject({ code: "P2002" });
  await expect(makeProduct(categoryId, { barcode: "111" })).rejects.toMatchObject({
    code: "P2002",
  });
  // Many products may have no barcode.
  await makeProduct(categoryId, { barcode: null });
  await makeProduct(categoryId, { barcode: null });
  expect(await db.product.count({ where: { barcode: null } })).toBe(2);
});

test("[FR-002] purchase price may be left empty (staff-created products)", async () => {
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId, { purchasePrice: null });
  expect(product.purchasePrice).toBeNull();
});

test("[FR-037] the database defaults the low stock threshold to 5", async () => {
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId, { stockQuantity: 5 });
  expect(product.lowStockThreshold).toBe(5);
  expect(stockStatus(product.stockQuantity, product.lowStockThreshold)).toBe("LOW_STOCK");
});

test("[FR-006] a product at zero stock is kept and shows Out of Stock; stock can never go negative", async () => {
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId, { stockQuantity: 1 });
  const empty = await db.product.update({
    where: { id: product.id },
    data: { stockQuantity: { decrement: 1 } },
  });
  expect(empty.stockQuantity).toBe(0);
  expect(stockStatus(empty.stockQuantity, empty.lowStockThreshold)).toBe("OUT_OF_STOCK");
  expect(await db.product.findUnique({ where: { id: product.id } })).not.toBeNull();

  await expect(
    db.product.update({ where: { id: product.id }, data: { stockQuantity: { decrement: 1 } } }),
  ).rejects.toThrow(/stockQuantity_nonnegative|check constraint/i);
});

test("[FR-004] deleting a discontinued product keeps its sales and history, with name and code", async () => {
  const staff = await makeUser("STAFF");
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId, {
    name: "Old Perfume",
    code: "PF-OLD",
    stockQuantity: 3,
  });
  const saleId = randomUUID();

  await db.$transaction(async (tx) => {
    await tx.sale.create({
      data: {
        id: saleId,
        occurredAt: new Date(),
        staffId: staff.id,
        subtotal: 25_000,
        total: 25_000,
        paymentMethod: "CASH",
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            quantity: 1,
            unitPrice: 25_000,
            unitCost: 15_000,
          },
        },
      },
    });
    await tx.product.update({
      where: { id: product.id },
      data: { stockQuantity: { decrement: 1 } },
    });
    await recordInventoryChange(tx, {
      productId: product.id,
      type: "SALE",
      quantityChange: -1,
      userId: staff.id,
      occurredAt: new Date(),
      saleId,
    });
  });

  await db.product.delete({ where: { id: product.id } });

  const item = await db.saleItem.findFirstOrThrow({ where: { saleId } });
  expect(item).toMatchObject({
    productId: null,
    productName: "Old Perfume",
    productCode: "PF-OLD",
  });
  const history = await db.inventoryChange.findFirstOrThrow({ where: { saleId } });
  expect(history).toMatchObject({
    productId: null,
    productName: "Old Perfume",
    productCode: "PF-OLD",
  });
  expect(await db.sale.count()).toBe(1);
});

test("[FR-004] a category that still has products cannot be deleted", async () => {
  const category = await makeCategory();
  await makeProduct(category.id);
  await expect(db.category.delete({ where: { id: category.id } })).rejects.toThrow();
});
