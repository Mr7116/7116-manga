import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";

/**
 * Gatekeeper for admin pages and admin APIs.
 * Public reading pages (/, /manga/...) and GET /api/manga stay open.
 * Route handlers also call requireAuth() themselves (defense in depth).
 */
export function proxy(request: NextRequest) {
  if (isAuthorized(request)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: กรุณาเข้าสู่ระบบผู้ดูแล" },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/import/:path*",
    "/watchlist/:path*",
    "/api/scrape/:path*",
    "/api/manga/save/:path*",
    "/api/manga/existing-chapters/:path*",
    "/api/watchlist/:path*",
    "/api/scheduler/:path*",
    "/api/cron/:path*",
    "/api/proxy/:path*",
  ],
};
