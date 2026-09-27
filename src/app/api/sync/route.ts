// Receives one offline-capable command from the device (FR-034–036, FR-049). Leaf 6.2.
// Used for every sale, refund, and restock, whether sent straight away or replayed from the
// outbox. Its address never changes between deploys, unlike a server action's, so an entry saved
// under an older version still replays. Only these three kinds exist here: every other change
// needs a connection and goes through its own server action. The actions check the session, the
// role, and the input, and are idempotent by the command's id. The service worker never caches
// this route.
import { NextResponse } from "next/server";
import { z } from "zod";
import { restockProduct } from "@/features/inventory/actions";
import type { RestockInput } from "@/features/inventory/schemas";
import { refundSale } from "@/features/refunds/actions";
import type { RefundSaleInput } from "@/features/refunds/schemas";
import { recordSale } from "@/features/sales/actions";
import type { RecordSaleInput } from "@/features/sales/schemas";
import { getCurrentUser } from "@/lib/auth";
import { fail, invalid, type Result } from "@/lib/result";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  kind: z.enum(["SALE", "REFUND", "RESTOCK"], {
    error: "Only sales, refunds, and restocks can be saved offline.",
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

  // The actions parse `input` with their Zod schemas before using it.
  const result =
    kind === "SALE"
      ? await recordSale(input as RecordSaleInput)
      : kind === "REFUND"
        ? await refundSale(input as RefundSaleInput)
        : await restockProduct(input as RestockInput);
  return reply(result);
}
