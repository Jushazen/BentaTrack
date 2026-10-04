// Receives one offline-capable command from the device (FR-034–036, FR-049). Leaf 6.2.
// Used for every sale, refund, and restock (leaf 6.2) and every product, category, and supplier
// change (leaf 9.4), whether sent straight away or replayed from the outbox. Its address never
// changes between deploys, unlike a server action's, so an entry saved under an older version
// still replays. Each kind goes to the same server action the app used online: the actions check
// the session, the role, and the input, and are idempotent by the command's id. A product photo
// arrives as a data: URL and is handed to the action as a File. The service worker never caches
// this route.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createCategory, deleteCategory, renameCategory } from "@/features/categories/actions";
import type {
  CreateCategoryInput,
  DeleteCategoryInput,
  RenameCategoryInput,
} from "@/features/categories/schemas";
import { restockProduct } from "@/features/inventory/actions";
import type { RestockInput } from "@/features/inventory/schemas";
import {
  archiveProduct,
  createProduct,
  restoreProduct,
  updateProduct,
} from "@/features/products/actions";
import {
  productCommandForm,
  type ProductCommand,
  type ProductIdInput,
} from "@/features/products/schemas";
import { refundSale } from "@/features/refunds/actions";
import type { RefundSaleInput } from "@/features/refunds/schemas";
import { recordSale } from "@/features/sales/actions";
import type { RecordSaleInput } from "@/features/sales/schemas";
import { createSupplier, deleteSupplier, updateSupplier } from "@/features/suppliers/actions";
import type {
  DeleteSupplierInput,
  SupplierInput,
  UpdateSupplierInput,
} from "@/features/suppliers/schemas";
import { getCurrentUser } from "@/lib/auth";
import { fail, invalid, type Result } from "@/lib/result";

export const dynamic = "force-dynamic";

type Input = Record<string, unknown>;

/** Each kind and the action that applies it. The actions parse `input` with their Zod schemas. */
const HANDLERS = {
  SALE: (input: Input) => recordSale(input as RecordSaleInput),
  REFUND: (input: Input) => refundSale(input as RefundSaleInput),
  RESTOCK: (input: Input) => restockProduct(input as RestockInput),
  PRODUCT_CREATE: (input: Input) => createProduct(productForm(input)),
  PRODUCT_UPDATE: (input: Input) => updateProduct(productForm(input)),
  PRODUCT_ARCHIVE: (input: Input) => archiveProduct(input as ProductIdInput),
  PRODUCT_RESTORE: (input: Input) => restoreProduct(input as ProductIdInput),
  CATEGORY_CREATE: (input: Input) => createCategory(input as CreateCategoryInput),
  CATEGORY_RENAME: (input: Input) => renameCategory(input as RenameCategoryInput),
  CATEGORY_DELETE: (input: Input) => deleteCategory(input as DeleteCategoryInput),
  SUPPLIER_CREATE: (input: Input) => createSupplier(input as SupplierInput),
  SUPPLIER_UPDATE: (input: Input) => updateSupplier(input as UpdateSupplierInput),
  SUPPLIER_DELETE: (input: Input) => deleteSupplier(input as DeleteSupplierInput),
} satisfies Record<string, (input: Input) => Promise<Result<unknown>>>;

type Kind = keyof typeof HANDLERS;

/** The FormData the product actions take. Anything malformed is left for their schema to refuse. */
function productForm(input: Input): FormData {
  const fields = typeof input.fields === "object" && input.fields !== null ? input.fields : {};
  const image =
    typeof input.image === "object" &&
    input.image !== null &&
    "dataUrl" in input.image &&
    typeof input.image.dataUrl === "string"
      ? {
          name: "name" in input.image ? String(input.image.name) : "photo",
          dataUrl: input.image.dataUrl,
        }
      : null;
  return productCommandForm({
    id: String(input.id ?? ""),
    ...(input.commandId !== undefined && { commandId: String(input.commandId) }),
    occurredAt: String(input.occurredAt ?? ""),
    fields: fields as Record<string, string>,
    image,
  } satisfies ProductCommand);
}

const requestSchema = z.object({
  kind: z.enum(Object.keys(HANDLERS) as [Kind, ...Kind[]], {
    error: "This change can't be synced. Update the app and try again.",
  }),
  /** The user the device recorded it under; null when it was sent without being queued. */
  recordedBy: z.string().min(1).nullable(),
  /** Checked by the command's own schema. */
  input: z.record(z.string(), z.unknown()),
});

function reply(result: Result<unknown>, status = 200) {
  return NextResponse.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(fail("VALIDATION", "The request wasn't valid JSON."), 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return reply(invalid(parsed.error.issues, "This change can't be synced."), 400);
  }
  const { kind, recordedBy, input } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return reply(fail("UNAUTHORIZED", "Please log in again."), 401);
  // Every action belongs to the person who did it (§5.2): never sync one under someone else.
  if (recordedBy !== null && recordedBy !== user.id) {
    return reply(
      fail(
        "FORBIDDEN",
        "Someone else recorded this. They need to log in on this device to sync it.",
      ),
      403,
    );
  }

  return reply(await HANDLERS[kind](input));
}
