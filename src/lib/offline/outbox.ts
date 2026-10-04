// Outbox: every change saved on this device until the server has it (FR-034–036, FR-049, §5.3
// "saved on the device first"). Leaf 6.2; product, category, and supplier changes since leaf 9.4.
// An entry is written before the command is sent and removed only once the server has answered,
// so closing the tab or losing the connection mid-request can't lose it. Entries keep the user who
// recorded them, so a later sign-in by someone else never syncs them under the wrong name (§5.2).
// Each change is also applied to the device store at once (applyToDevice), and again after the
// device downloads fresh data (reapplyOutbox), so offline pages show it until it syncs.
// Browser only.
import type { CategoryOption } from "@/features/categories/queries";
import type {
  CreateCategoryInput,
  DeleteCategoryInput,
  RenameCategoryInput,
} from "@/features/categories/schemas";
import type { RestockResult } from "@/features/inventory/actions";
import type { RestockInput } from "@/features/inventory/schemas";
import type { SavedProduct } from "@/features/products/actions";
import {
  createProductSchema,
  updateProductSchema,
  type ProductCommand,
  type ProductIdCommand,
} from "@/features/products/schemas";
import type { RefundResult } from "@/features/refunds/actions";
import type { RefundSaleInput } from "@/features/refunds/schemas";
import type { SaleResult } from "@/features/sales/actions";
import { saleTotals } from "@/features/sales/cart";
import type { RecordSaleInput } from "@/features/sales/schemas";
import type { SupplierRow } from "@/features/suppliers/queries";
import type {
  DeleteSupplierInput,
  SupplierInput,
  UpdateSupplierInput,
} from "@/features/suppliers/schemas";
import type { Role } from "@/generated/prisma/enums";
import { formatPeso } from "@/lib/money";
import { can, type Capability } from "@/lib/permissions";
import { fail, type Result } from "@/lib/result";
import {
  offlineDb,
  type CatalogProduct,
  type OfflineDb,
  type OutboxEntry,
  type OutboxKind,
} from "./db";

export type CommandKind = OutboxKind;
export const COMMAND_KINDS = [
  "SALE",
  "REFUND",
  "RESTOCK",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE",
  "PRODUCT_RESTORE",
  "CATEGORY_CREATE",
  "CATEGORY_RENAME",
  "CATEGORY_DELETE",
  "SUPPLIER_CREATE",
  "SUPPLIER_UPDATE",
  "SUPPLIER_DELETE",
] as const satisfies CommandKind[];

/**
 * What each kind carries. Every one has a client-generated UUID: `id` for a sale, refund,
 * restock, or anything added (also the new record's id), `commandId` for a change to an existing
 * record (whose id is then `id`).
 */
export type CommandInputs = {
  SALE: RecordSaleInput;
  REFUND: RefundSaleInput;
  RESTOCK: RestockInput;
  PRODUCT_CREATE: ProductCommand;
  PRODUCT_UPDATE: ProductCommand & { commandId: string };
  PRODUCT_ARCHIVE: ProductIdCommand;
  PRODUCT_RESTORE: ProductIdCommand;
  CATEGORY_CREATE: CreateCategoryInput & { id: string };
  CATEGORY_RENAME: RenameCategoryInput & { commandId: string };
  CATEGORY_DELETE: DeleteCategoryInput & { commandId: string };
  SUPPLIER_CREATE: SupplierInput & { id: string };
  SUPPLIER_UPDATE: UpdateSupplierInput & { commandId: string };
  SUPPLIER_DELETE: DeleteSupplierInput & { commandId: string };
};

export type CommandResults = {
  SALE: SaleResult;
  REFUND: RefundResult;
  RESTOCK: RestockResult;
  PRODUCT_CREATE: SavedProduct;
  PRODUCT_UPDATE: SavedProduct;
  PRODUCT_ARCHIVE: { id: string; name: string };
  PRODUCT_RESTORE: { id: string; name: string };
  CATEGORY_CREATE: CategoryOption;
  CATEGORY_RENAME: CategoryOption;
  CATEGORY_DELETE: { id: string };
  SUPPLIER_CREATE: SupplierRow;
  SUPPLIER_UPDATE: SupplierRow;
  SUPPLIER_DELETE: { id: string; productsUnlinked: number };
};

/** What each kind needs, as its server action checks (FR-032). */
export const COMMAND_CAPABILITY: Record<CommandKind, Capability> = {
  SALE: "sales.create",
  REFUND: "refunds.create",
  RESTOCK: "inventory.restock",
  PRODUCT_CREATE: "products.create",
  PRODUCT_UPDATE: "products.update",
  PRODUCT_ARCHIVE: "products.archive",
  PRODUCT_RESTORE: "products.archive",
  CATEGORY_CREATE: "categories.manage",
  CATEGORY_RENAME: "categories.manage",
  CATEGORY_DELETE: "categories.manage",
  SUPPLIER_CREATE: "suppliers.manage",
  SUPPLIER_UPDATE: "suppliers.manage",
  SUPPLIER_DELETE: "suppliers.manage",
};

/** Who is signed in on this device. `role` lets the device refuse what the server would. */
export type SyncUser = { id: string; name: string; role?: Role };

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

/** The change's own UUID: `commandId` for a change to an existing record, else `id`. */
export function commandIdOf(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const id = typeof input.commandId === "string" ? input.commandId : input.id;
  return typeof id === "string" ? id : null;
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
    commandIdOf(payload.input) !== entry.id
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
  const productName = async (id: string) => (await db.products.get(id))?.name ?? "a product";
  const categoryName = async (id: string) => (await db.categories.get(id))?.name ?? "a category";
  const supplierName = async (id: string) => (await db.suppliers.get(id))?.name ?? "a supplier";
  const typed = input as CommandInputs[CommandKind];
  switch (kind) {
    case "SALE": {
      const sale = typed as RecordSaleInput;
      const totals = saleTotals(sale.items, sale.discount ?? null);
      const count = sale.items.reduce((sum, item) => sum + item.quantity, 0);
      return `Sale of ${formatPeso(totals.total)} (${units(count)})`;
    }
    case "REFUND": {
      const refund = typed as RefundSaleInput;
      return `Refund of ${units(refund.items.reduce((sum, item) => sum + item.quantity, 0))}`;
    }
    case "RESTOCK": {
      const restock = typed as RestockInput;
      return `Restock of ${restock.quantity} × ${await productName(restock.productId)}`;
    }
    case "PRODUCT_CREATE":
      return `Add product ${(typed as ProductCommand).fields.name?.trim() || "(no name)"}`;
    case "PRODUCT_UPDATE":
      return `Edit product ${(typed as ProductCommand).fields.name?.trim() || "(no name)"}`;
    case "PRODUCT_ARCHIVE":
      return `Archive ${await productName((typed as ProductIdCommand).id)}`;
    case "PRODUCT_RESTORE":
      return `Restore ${await productName((typed as ProductIdCommand).id)}`;
    case "CATEGORY_CREATE":
      return `Add category “${(typed as CreateCategoryInput).name.trim()}”`;
    case "CATEGORY_RENAME": {
      const rename = typed as RenameCategoryInput;
      return `Rename category “${await categoryName(rename.id)}” to “${rename.name.trim()}”`;
    }
    case "CATEGORY_DELETE":
      return `Delete category “${await categoryName((typed as DeleteCategoryInput).id)}”`;
    case "SUPPLIER_CREATE":
      return `Add supplier ${(typed as SupplierInput).name.trim()}`;
    case "SUPPLIER_UPDATE":
      return `Edit supplier ${(typed as UpdateSupplierInput).name.trim()}`;
    default:
      return `Delete supplier ${await supplierName((typed as DeleteSupplierInput).id)}`;
  }
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
  const id = commandIdOf(input);
  if (!id) throw new Error("command id missing");
  const summary = await describe(kind, input, db);
  return db.transaction("rw", db.outbox, async () => {
    const existing = await db.outbox.get(id);
    if (existing) return existing as QueuedCommand<K>;
    // Strictly increasing, so two commands in the same millisecond still replay in order.
    const last = await db.outbox.orderBy("createdAt").last();
    const entry: QueuedCommand<K> = {
      id,
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

// ---- Order: what a change waits for (FR-049) ----------------------------------------------

/** Records a change creates or changes that a later change may depend on. */
function defines(kind: CommandKind, input: CommandInputs[CommandKind]): string[] {
  switch (kind) {
    case "SALE": {
      const sale = input as RecordSaleInput;
      return [`sale:${sale.id}`, ...sale.items.map((item) => `stock:${item.productId}`)];
    }
    case "REFUND":
      return [];
    case "RESTOCK":
      return [`stock:${(input as RestockInput).productId}`];
    case "PRODUCT_CREATE":
    case "PRODUCT_UPDATE":
      return [`product:${(input as ProductCommand).id}`, "product-moves"];
    case "PRODUCT_ARCHIVE":
    case "PRODUCT_RESTORE":
      return [`product:${(input as ProductIdCommand).id}`];
    case "CATEGORY_CREATE":
    case "CATEGORY_RENAME":
    case "CATEGORY_DELETE":
      return [`category:${(input as { id: string }).id}`];
    default:
      return [`supplier:${(input as { id: string }).id}`];
  }
}

/** Records a change needs as the server will see them when it arrives. */
function needs(kind: CommandKind, input: CommandInputs[CommandKind]): string[] {
  const product = (fields: Record<string, string>) => [
    `category:${fields.categoryId ?? ""}`,
    ...(fields.supplierId ? [`supplier:${fields.supplierId}`] : []),
  ];
  switch (kind) {
    case "SALE":
      return (input as RecordSaleInput).items.map((item) => `product:${item.productId}`);
    case "REFUND":
      return [`sale:${(input as RefundSaleInput).saleId}`];
    case "RESTOCK":
      return [`product:${(input as RestockInput).productId}`];
    case "PRODUCT_CREATE":
      return product((input as ProductCommand).fields);
    case "PRODUCT_UPDATE": {
      const edit = input as ProductCommand;
      // The stock check compares with the count the device showed, pending sales included.
      return [`product:${edit.id}`, `stock:${edit.id}`, ...product(edit.fields)];
    }
    case "PRODUCT_ARCHIVE":
    case "PRODUCT_RESTORE":
      return [`product:${(input as ProductIdCommand).id}`];
    case "CATEGORY_CREATE":
    case "SUPPLIER_CREATE":
      return [];
    case "CATEGORY_RENAME":
      return [`category:${(input as { id: string }).id}`];
    case "CATEGORY_DELETE":
      // Products moved out of it offline must reach the server first.
      return [`category:${(input as { id: string }).id}`, "product-moves"];
    default:
      return [`supplier:${(input as { id: string }).id}`];
  }
}

/**
 * True when an earlier entry on this device creates or changes something this change needs (a
 * product added offline, then sold), so it must reach the server after that one. Unrelated
 * changes don't wait. Refused entries count too: a change that needs one is refused with it.
 */
export async function waitsBehind<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb = offlineDb(),
): Promise<boolean> {
  const id = commandIdOf(input);
  const wanted = new Set(needs(kind, input));
  if (wanted.size === 0) return false;
  for (const raw of await outboxEntries(db)) {
    if (raw.id === id) break;
    const entry = readEntry(raw);
    if (entry && defines(entry.kind, entry.payload.input).some((key) => wanted.has(key))) {
      return true;
    }
  }
  return false;
}

// ---- Checks against the device's data, for changes that can't reach the server now ----------

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/**
 * Refuses, on the device, a queued change the server would refuse for what the device already
 * knows: a code, barcode, or category name in use, a missing category, product, or supplier, a
 * category that still has products, or an archived product (FR-043, FR-059). Null when it looks
 * fine; the server checks again when it syncs.
 */
export async function checkOnDevice<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb = offlineDb(),
): Promise<Result<never> | null> {
  const typed = input as CommandInputs[CommandKind];
  switch (kind) {
    case "PRODUCT_CREATE":
    case "PRODUCT_UPDATE": {
      const { id, fields } = typed as ProductCommand;
      const editing = kind === "PRODUCT_UPDATE";
      if (editing) {
        const product = await db.products.get(id);
        if (!product) return fail("NOT_FOUND", "That product no longer exists.");
        if (product.archivedAt) {
          return fail("CONFLICT", "This product is archived. Restore it first.");
        }
      }
      if (!(await db.categories.get(fields.categoryId ?? ""))) {
        const message = "That category no longer exists. Choose another.";
        return fail("VALIDATION", message, { categoryId: [message] });
      }
      if (fields.supplierId && !(await db.suppliers.get(fields.supplierId))) {
        const message = "That supplier no longer exists. Choose another.";
        return fail("VALIDATION", message, { supplierId: [message] });
      }
      const code = fields.code?.trim();
      const barcode = fields.barcode?.trim();
      const clash = await db.products
        .filter(
          (p) =>
            p.id !== id &&
            (sameText(p.code, code) || (Boolean(barcode) && sameText(p.barcode, barcode))),
        )
        .first();
      if (clash) {
        // Archived products keep their code and barcode reserved (FR-059).
        const owner = clash.archivedAt ? `${clash.name} (archived)` : clash.name;
        return sameText(clash.code, code)
          ? fail("CONFLICT", `Code ${clash.code} is already used by ${owner}.`, {
              code: [`Already used by ${owner}.`],
            })
          : fail("CONFLICT", `That barcode is already used by ${owner}.`, {
              barcode: [`Already used by ${owner}.`],
            });
      }
      return null;
    }
    case "PRODUCT_ARCHIVE":
    case "PRODUCT_RESTORE": {
      const product = await db.products.get((typed as ProductIdCommand).id);
      if (!product) return fail("NOT_FOUND", "That product no longer exists.");
      const archive = kind === "PRODUCT_ARCHIVE";
      if (Boolean(product.archivedAt) === archive) {
        const state = archive ? "already archived" : "not archived";
        return fail("CONFLICT", `${product.name} is ${state}.`);
      }
      return null;
    }
    case "CATEGORY_CREATE":
    case "CATEGORY_RENAME": {
      const { id, name } = typed as { id: string; name: string };
      if (kind === "CATEGORY_RENAME" && !(await db.categories.get(id))) {
        return fail("NOT_FOUND", "That category no longer exists.");
      }
      const trimmed = name.trim();
      const clash = await db.categories
        .filter((c) => c.id !== id && sameText(c.name, trimmed))
        .first();
      if (!clash) return null;
      const message = `There is already a category called “${trimmed}”.`;
      return fail("CONFLICT", message, { name: [message] });
    }
    case "CATEGORY_DELETE": {
      const { id } = typed as DeleteCategoryInput;
      const category = await db.categories.get(id);
      if (!category) return fail("NOT_FOUND", "That category no longer exists.");
      const count = await db.products.where("categoryId").equals(id).count();
      if (count === 0) return null;
      return fail(
        "CONFLICT",
        `“${category.name}” still has ${count === 1 ? "1 product" : `${count} products`}. ` +
          "Move them to another category or delete them first.",
      );
    }
    case "SUPPLIER_UPDATE":
    case "SUPPLIER_DELETE":
      return (await db.suppliers.get((typed as { id: string }).id))
        ? null
        : fail("NOT_FOUND", "That supplier no longer exists.");
    default:
      return null;
  }
}

// ---- Applying a change to the device store ------------------------------------------------

/** Which products a re-apply may touch: all of them, or only the ones a snapshot just wrote. */
export type ProductScope = "all" | ReadonlySet<string>;

function inScope(scope: ProductScope, productId: string): boolean {
  return scope === "all" || scope.has(productId);
}

function withLowerCase(product: Omit<CatalogProduct, "nameLower" | "codeLower" | "barcodeLower">) {
  return {
    ...product,
    nameLower: product.name.toLowerCase(),
    codeLower: product.code.toLowerCase(),
    barcodeLower: product.barcode ? product.barcode.toLowerCase() : null,
  } satisfies CatalogProduct;
}

function dateText(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

async function addStock(db: OfflineDb, productId: string, delta: number, scope: ProductScope) {
  if (!inScope(scope, productId) || !Number.isFinite(delta)) return;
  const product = await db.products.get(productId);
  if (!product) return;
  await db.products.put({ ...product, stockQuantity: Math.max(0, product.stockQuantity + delta) });
}

async function applyProduct(
  kind: "PRODUCT_CREATE" | "PRODUCT_UPDATE",
  command: ProductCommand,
  db: OfflineDb,
  scope: ProductScope,
) {
  if (!inScope(scope, command.id)) return;
  const schema = kind === "PRODUCT_CREATE" ? createProductSchema : updateProductSchema;
  const parsed = schema.safeParse({ ...command.fields, id: command.id });
  if (!parsed.success) return;
  const input = parsed.data;
  const at = new Date(command.occurredAt).toISOString();
  const categoryName = (await db.categories.get(input.categoryId))?.name ?? "";
  const before = await db.products.get(command.id);
  const image = command.image?.dataUrl;

  if (kind === "PRODUCT_CREATE") {
    await db.products.put(
      withLowerCase({
        id: command.id,
        name: input.name,
        code: input.code,
        barcode: input.barcode,
        brand: input.brand,
        categoryId: input.categoryId,
        categoryName,
        supplierId: input.supplierId ?? null,
        purchasePrice: input.purchasePrice ?? null,
        sellingPrice: input.sellingPrice,
        stockQuantity: input.stockQuantity,
        lowStockThreshold: input.lowStockThreshold,
        expirationDate: dateText(input.expirationDate),
        imageUrl: image ?? null,
        archivedAt: null,
        createdAt: at,
        updatedAt: at,
      }),
    );
    return;
  }
  if (!before) return;
  const edit = parsed.data as typeof parsed.data & {
    stockWhenLoaded: number;
    removeImage: boolean;
  };
  await db.products.put(
    withLowerCase({
      ...before,
      name: input.name,
      code: input.code,
      barcode: input.barcode,
      brand: input.brand,
      categoryId: input.categoryId,
      categoryName,
      sellingPrice: input.sellingPrice,
      lowStockThreshold: input.lowStockThreshold,
      expirationDate: dateText(input.expirationDate),
      // The server takes a stock correction only when the count was changed in the form.
      ...(edit.stockQuantity !== edit.stockWhenLoaded && { stockQuantity: edit.stockQuantity }),
      ...(input.purchasePrice !== undefined && { purchasePrice: input.purchasePrice }),
      ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
      imageUrl: image ?? (edit.removeImage ? null : before.imageUrl),
      updatedAt: at,
    }),
  );
}

async function applyOne(
  kind: CommandKind,
  input: CommandInputs[CommandKind],
  db: OfflineDb,
  scope: ProductScope,
) {
  switch (kind) {
    case "SALE":
      for (const item of (input as RecordSaleInput).items) {
        await addStock(db, item.productId, -item.quantity, scope);
      }
      return;
    case "RESTOCK": {
      const restock = input as RestockInput;
      await addStock(db, restock.productId, restock.quantity, scope);
      return;
    }
    case "REFUND": {
      // A refund puts back the units it returns to stock (leaf 9.3): its lines name the product
      // directly, or a line of a sale the device holds.
      const refund = input as RefundSaleInput;
      const sale = await db.sales.get(refund.saleId);
      for (const line of refund.items) {
        if (line.returnToStock === false) continue;
        const productId =
          line.productId ?? sale?.items.find((item) => item.id === line.saleItemId)?.productId;
        if (productId) await addStock(db, productId, line.quantity, scope);
      }
      return;
    }
    case "PRODUCT_CREATE":
    case "PRODUCT_UPDATE":
      await applyProduct(kind, input as ProductCommand, db, scope);
      return;
    case "PRODUCT_ARCHIVE":
    case "PRODUCT_RESTORE": {
      const { id, occurredAt } = input as ProductIdCommand;
      const product = inScope(scope, id) ? await db.products.get(id) : undefined;
      if (!product) return;
      const archivedAt = kind === "PRODUCT_ARCHIVE" ? new Date(occurredAt).toISOString() : null;
      await db.products.put({ ...product, archivedAt });
      return;
    }
    // Categories and suppliers hold no counts, so these are safe to apply again at any time.
    case "CATEGORY_CREATE": {
      const { id, name } = input as CommandInputs["CATEGORY_CREATE"];
      const now = new Date().toISOString();
      const stored = await db.categories.get(id);
      await db.categories.put({ createdAt: now, ...stored, id, name: name.trim(), updatedAt: now });
      return;
    }
    case "CATEGORY_RENAME": {
      const { id, name } = input as RenameCategoryInput;
      const stored = await db.categories.get(id);
      if (!stored) return;
      await db.categories.put({
        ...stored,
        name: name.trim(),
        updatedAt: new Date().toISOString(),
      });
      await db.products.where("categoryId").equals(id).modify({ categoryName: name.trim() });
      return;
    }
    case "CATEGORY_DELETE":
      await db.categories.delete((input as DeleteCategoryInput).id);
      return;
    case "SUPPLIER_CREATE":
    case "SUPPLIER_UPDATE": {
      const supplier = input as UpdateSupplierInput;
      const stored = await db.suppliers.get(supplier.id);
      if (kind === "SUPPLIER_UPDATE" && !stored) return;
      const now = new Date().toISOString();
      const blank = (value: string | null | undefined) => value?.trim() || null;
      await db.suppliers.put({
        createdAt: now,
        ...stored,
        id: supplier.id,
        name: supplier.name.trim(),
        contactPerson: blank(supplier.contactPerson),
        phone: blank(supplier.phone),
        email: blank(supplier.email)?.toLowerCase() ?? null,
        address: blank(supplier.address),
        updatedAt: now,
      });
      return;
    }
    case "SUPPLIER_DELETE": {
      const { id } = input as DeleteSupplierInput;
      await db.suppliers.delete(id);
      // Deleting a supplier unlinks its products; the products stay (FR-041).
      await db.products.filter((p) => p.supplierId === id).modify({ supplierId: null });
      return;
    }
  }
}

function deviceTables(db: OfflineDb) {
  return [db.products, db.categories, db.suppliers, db.sales];
}

/**
 * Applies a change to the device store the way the server will apply it, so the offline pages,
 * search, and checkout show it straight away (FR-049): stock moves for sales, refunds, and
 * restocks (never below zero), products added, edited, archived, or restored, and categories and
 * suppliers added, renamed or edited, or deleted. Records the device doesn't hold are skipped.
 */
export async function applyToDevice<K extends CommandKind>(
  kind: K,
  input: CommandInputs[K],
  db: OfflineDb = offlineDb(),
  scope: ProductScope = "all",
): Promise<void> {
  await db.transaction("rw", deviceTables(db), () => applyOne(kind, input, db, scope));
}

/** Leaf 6.2's name for applyToDevice(), kept for its callers. */
export const applyToCatalog = applyToDevice;

/** A queued change as a device scoped for `role` may hold it: staff never get suppliers or costs. */
function visibleTo(role: Role, entry: QueuedCommand): CommandInputs[CommandKind] | null {
  if (can(role, "suppliers.read") && can(role, "products.cost")) return entry.payload.input;
  if (entry.kind.startsWith("SUPPLIER_")) return null;
  if (entry.kind === "PRODUCT_CREATE" || entry.kind === "PRODUCT_UPDATE") {
    const command = entry.payload.input as ProductCommand;
    const fields = { ...command.fields };
    delete fields.purchasePrice;
    delete fields.supplierId;
    return { ...command, fields };
  }
  return entry.payload.input;
}

/**
 * Applies every change still waiting (not refused) again, oldest first, after a snapshot replaced
 * the device's records with the server's, which don't have them yet. Products are only touched
 * where the snapshot wrote them (`scope`): any other product still carries the change, and
 * applying a stock movement twice would count it twice. `role` is whom the snapshot was made for:
 * an owner's queued supplier changes and purchase prices never reach a staff member's copy
 * (FR-055). Runs inside the caller's transaction.
 */
export async function reapplyOutbox(db: OfflineDb, scope: ProductScope, role: Role): Promise<void> {
  for (const raw of await db.outbox.orderBy("createdAt").toArray()) {
    const entry = raw.lastError === null ? readEntry(raw) : null;
    const input = entry ? visibleTo(role, entry) : null;
    if (entry && input) await applyOne(entry.kind, input, db, scope);
  }
}
