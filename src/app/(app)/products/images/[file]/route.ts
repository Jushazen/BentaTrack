// Serves product photos stored on local disk when Vercel Blob isn't configured (dev and tests;
// see src/lib/storage.ts). Signed-in users only; file names are random UUIDs, so they never change.
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { readLocalProductImage } from "@/lib/storage";

export async function GET(_request: Request, ctx: RouteContext<"/products/images/[file]">) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "products.read")) {
    return new Response("Not found", { status: 404 });
  }
  const { file } = await ctx.params;
  const image = await readLocalProductImage(file);
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
