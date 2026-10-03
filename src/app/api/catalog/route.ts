// The device's offline copy of everything its user may see (FR-055, leaf 9.1; product-only in
// leaf 6.1). `?since=<cursor>&user=<id>&role=<role>` asks for only what changed. Signed-in users
// only; the service worker never caches it (src/app/sw.ts), so owner data never lands in a
// service worker cache.
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { NextResponse, type NextRequest } from "next/server";
import { deviceSnapshot } from "./device-snapshot";

const gzipAsync = promisify(gzip);

export const dynamic = "force-dynamic";

const STATUS = { UNAUTHORIZED: 401, FORBIDDEN: 403, VALIDATION: 400 } as const;

/** Whether an Accept-Encoding header allows gzip (e.g. "gzip, deflate, br"; not "gzip;q=0"). */
function acceptsGzip(header: string | null): boolean {
  return (header ?? "").split(",").some((part) => {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    const q = params.find((p) => p.trim().startsWith("q="));
    return name === "gzip" && (!q || Number(q.trim().slice(2)) > 0);
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await deviceSnapshot({
    since: params.get("since") ?? undefined,
    user: params.get("user") ?? undefined,
    role: params.get("role") ?? undefined,
  });
  if (!result.ok) {
    const code = result.error.code;
    const status =
      code === "FORBIDDEN" || code === "VALIDATION" ? STATUS[code] : STATUS.UNAUTHORIZED;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
    Vary: "Accept-Encoding",
  };
  const json = JSON.stringify(result.data);
  // `next start` compresses pages but not route handler replies, and a whole shop's first
  // snapshot is several megabytes of very repetitive JSON (about a tenth of that gzipped).
  if (!acceptsGzip(request.headers.get("accept-encoding"))) {
    return new NextResponse(json, { headers });
  }
  const body = new Uint8Array(await gzipAsync(json));
  return new NextResponse(body, { headers: { ...headers, "Content-Encoding": "gzip" } });
}
