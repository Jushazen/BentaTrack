// Catalog snapshot for the device's offline copy (§4.9). Leaf 6.1. Signed-in users only; the
// service worker never caches it.
import { NextResponse } from "next/server";
import { catalogSnapshot } from "@/features/search/queries";

export const dynamic = "force-dynamic";

const STATUS = { UNAUTHORIZED: 401, FORBIDDEN: 403 } as const;

export async function GET() {
  const result = await catalogSnapshot();
  if (!result.ok) {
    const status = result.error.code === "FORBIDDEN" ? STATUS.FORBIDDEN : STATUS.UNAUTHORIZED;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  return NextResponse.json(
    { products: result.data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
