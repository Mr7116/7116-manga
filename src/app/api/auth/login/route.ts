import { NextResponse } from "next/server";
import {
  createSessionToken,
  verifyAdminPassword,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { success: false, error: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ADMIN_SECRET" },
      { status: 503 }
    );
  }

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {}

  if (!verifyAdminPassword(password)) {
    // Slow down brute-force attempts a little
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ success: false, error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
