// Health check for deployment monitoring and scripts/gates/check-deploy.mjs. Leaf 7.2.
// Public (no session needed) and says only whether the database answers, never why it failed.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
