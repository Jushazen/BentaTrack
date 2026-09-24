// Fast, optimistic route protection from the session JWT (Next 16 "proxy", formerly middleware).
// The authoritative check is getCurrentUser()/requireCapability() in src/lib/auth.ts.
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { can, capabilityForPath, isProtectedPath } from "@/lib/permissions";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (pathname === "/login") {
    return token ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }

  if (!isProtectedPath(pathname)) return NextResponse.next();

  if (!token) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(login);
  }

  const capability = capabilityForPath(pathname);
  if (capability && !can(token.role, capability)) {
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, the auth API, and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|sw.js|.*\\.[a-zA-Z0-9]+$).*)"],
};
