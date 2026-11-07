import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

function clear(request: Request, redirect: boolean) {
  const res = redirect
    ? NextResponse.redirect(new URL("/", request.url), { status: 303 })
    : NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function POST(request: Request) {
  return clear(request, false);
}

export async function GET(request: Request) {
  return clear(request, true);
}
