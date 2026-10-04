// Receives one offline-capable command from the device (FR-034–036, FR-049). Leaf 6.2.
// Used for every sale, refund, and restock (leaf 6.2) and every product, category, and supplier
// change (leaf 9.4), whether sent straight away or replayed from the outbox. Account and password
// changes are never sent here: they need a connection (FR-049, leaf 9.5). Its address never
// changes between deploys, unlike a server action's, so an entry saved under an older version
// still replays. Each kind goes to the same server action the app used online: the actions check
// the session, the role, and the input, and are idempotent by the command's id. A product photo
// arrives as a data: URL and is handed to the action as a File. The service worker never caches
// this route.
// A change is synced by the person who recorded it, with one exception (FR-036, decided
// 2026-10-03): the owner may send a deactivated staff member's changes left on a device. They are
// applied as that staff member (§5.2), with their role, and only if made (device time, FR-054)
// before the account was deactivated.
// GET tells the device whether its session still counts (FR-045, FR-060), so a device that was
// offline when its account was deactivated or its password changed or reset signs out when it
// reconnects (leaf 9.5).
import { getServerSession } from "next-auth";
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
import {
  authOptions,
  checkSession,
  getCurrentUser,
  runAsRecorder,
  type SessionEndReason,
  type SessionUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fail, invalid, ok, type Result } from "@/lib/result";

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

/**
 * The deactivated staff member the owner is sending a change for, or why it can't be sent. Only
 * the owner may; only for a staff account that is deactivated; only a change made before then.
 */
async function deactivatedRecorder(
  owner: SessionUser,
  recordedBy: string,
  input: Input,
): Promise<Result<SessionUser>> {
  const notYours = fail(
    "FORBIDDEN",
    "Someone else recorded this. They need to log in on this device to sync it.",
  );
  if (!can(owner.role, "users.manage")) return notYours;
  const recorder = await db.user.findUnique({
    where: { id: recordedBy },
    select: { id: true, email: true, name: true, role: true, active: true, deactivatedAt: true },
  });
  if (!recorder || recorder.role !== "STAFF" || recorder.active || !recorder.deactivatedAt) {
    return notYours;
  }
  const madeAt = typeof input.occurredAt === "string" ? Date.parse(input.occurredAt) : NaN;
  if (!Number.isFinite(madeAt) || madeAt >= recorder.deactivatedAt.getTime()) {
    return fail(
      "FORBIDDEN",
      `This was recorded after ${recorder.name}'s account was deactivated, so it can't be saved.`,
    );
  }
  const { id, email, name, role } = recorder;
  return ok({ id, email, name, role });
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
    const recorder = await deactivatedRecorder(user, recordedBy, input);
    if (!recorder.ok) return reply(recorder, 403);
    return reply(await runAsRecorder<Result<unknown>>(recorder.data, () => HANDLERS[kind](input)));
  }

  return reply(await HANDLERS[kind](input));
}

/** What GET answers for a signed-in device. */
export type SessionStatus = {
  /** Why the session no longer counts; null while it does. */
  ended: SessionEndReason | null;
  userId: string;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return reply(fail("UNAUTHORIZED", "Please log in again."), 401);
  const { user, ended } = await checkSession(userId, session.user.sessionVersion);
  const status: SessionStatus = user
    ? { ended: null, userId: user.id }
    : { ended: ended ?? "deactivated", userId };
  return reply(ok(status));
}
