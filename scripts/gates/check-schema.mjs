// Gate oracle: prisma/schema.prisma contains the agreed data model
// (SRS §6.1 as amended by docs/SRS-V2-amendments.md section C; names fixed in PLAN.md "Contract").
// Prints SCHEMA OK only when every model, field, and enum value is present.
import { readFileSync } from "node:fs";

const MODELS = {
  User: ["id", "email", "name", "passwordHash", "role", "active", "createdAt", "updatedAt"],
  Category: ["id", "name"],
  Supplier: ["id", "name", "contactPerson", "phone", "email", "address"],
  Product: [
    "id",
    "name",
    "code",
    "barcode",
    "categoryId",
    "brand",
    "supplierId",
    "purchasePrice",
    "sellingPrice",
    "stockQuantity",
    "lowStockThreshold",
    "expirationDate",
    "imageUrl",
    "createdAt",
    "updatedAt",
  ],
  Sale: [
    "id",
    "occurredAt",
    "staffId",
    "customerInfo",
    "subtotal",
    "discountType",
    "discountValue",
    "discountAmount",
    "total",
    "paymentMethod",
  ],
  SaleItem: [
    "id",
    "saleId",
    "productId",
    "productName",
    "productCode",
    "quantity",
    "unitPrice",
    "unitCost",
    "refundedQuantity",
  ],
  Refund: ["id", "saleId", "occurredAt", "userId", "amount", "note"],
  RefundItem: ["id", "refundId", "saleItemId", "quantity", "amount"],
  InventoryChange: [
    "id",
    "productId",
    "productName",
    "productCode",
    "type",
    "quantityChange",
    "stockAfter",
    "saleId",
    "refundId",
    "userId",
    "note",
    "occurredAt",
  ],
};
const ENUMS = {
  Role: ["OWNER", "STAFF"],
  PaymentMethod: ["CASH", "GCASH"],
  DiscountType: ["AMOUNT", "PERCENT"],
  InventoryChangeType: ["SALE", "RESTOCK", "EDIT", "REFUND", "REMOVAL"],
};
// Unique constraints required by the SRS (FR-002, FR-044, FR-043).
const UNIQUE = { Product: ["code", "barcode"], User: ["email"], Category: ["name"] };

const text = readFileSync("prisma/schema.prisma", "utf8").replace(/\/\/.*$/gm, "");
const blocks = {};
for (const m of text.matchAll(/^\s*(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm)) {
  blocks[`${m[1]}:${m[2]}`] = m[3]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

const failures = [];
for (const [model, fields] of Object.entries(MODELS)) {
  const lines = blocks[`model:${model}`];
  if (!lines) {
    failures.push(`missing model ${model}`);
    continue;
  }
  const names = new Map(lines.map((l) => [l.split(/\s+/)[0], l]));
  for (const f of fields) if (!names.has(f)) failures.push(`${model}.${f} missing`);
  for (const f of UNIQUE[model] ?? []) {
    if (names.has(f) && !/@unique\b/.test(names.get(f)))
      failures.push(`${model}.${f} must be @unique`);
  }
}
for (const [name, values] of Object.entries(ENUMS)) {
  const lines = blocks[`enum:${name}`];
  if (!lines) {
    failures.push(`missing enum ${name}`);
    continue;
  }
  const present = new Set(lines.map((l) => l.split(/\s+/)[0]));
  for (const v of values) if (!present.has(v)) failures.push(`enum ${name} missing ${v}`);
  for (const v of present)
    if (!values.includes(v)) failures.push(`enum ${name} has unexpected ${v}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`SCHEMA OK (${Object.keys(MODELS).length} models, ${Object.keys(ENUMS).length} enums)`);
