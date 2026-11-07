import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Authentication helpers
 * ----------------------------------------------------
 * - ADMIN_SECRET : password used on /login. A signed session cookie is issued.
 * - CRON_SECRET  : bearer token for machine callers (Vercel Cron, Supabase pg_cron,
 *                  cron-job.org, scripts/sync-daemon.mjs).
 *
 * Both are read from environment variables. If ADMIN_SECRET is not set, every
 * protected route is denied (fail closed).
 */

export const SESSION_COOKIE = "manga_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Session token = HMAC(ADMIN_SECRET, "admin:<issuedAt>") so it can't be forged without the secret. */
export function createSessionToken(issuedAt = Date.now()): string | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  const sig = createHmac("sha256", secret).update(`admin:${issuedAt}`).digest("hex");
  return `${issuedAt}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !token) return false;
  const [issuedAtStr, sig] = token.split(".");
  const issuedAt = Number(issuedAtStr);
  if (!issuedAt || !sig) return false;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return false;
  const expected = createHmac("sha256", secret).update(`admin:${issuedAt}`).digest("hex");
  return safeEqual(sig, expected);
}

export function verifyAdminPassword(password: unknown): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || typeof password !== "string") return false;
  return safeEqual(password, secret);
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/** True when the request comes from a logged-in admin (cookie) or carries a valid secret as Bearer token. */
export function isAuthorized(req: Request): boolean {
  if (verifySessionToken(readCookie(req, SESSION_COOKIE))) return true;

  const token = bearerToken(req);
  if (token) {
    const cron = process.env.CRON_SECRET;
    const admin = process.env.ADMIN_SECRET;
    if (cron && safeEqual(token, cron)) return true;
    if (admin && safeEqual(token, admin)) return true;
  }
  return false;
}

/** Use at the top of protected route handlers: `const denied = requireAuth(req); if (denied) return denied;` */
export function requireAuth(req: Request): NextResponse | null {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { success: false, error: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ADMIN_SECRET" },
      { status: 503 }
    );
  }
  if (isAuthorized(req)) return null;
  return NextResponse.json(
    { success: false, error: "Unauthorized: กรุณาเข้าสู่ระบบผู้ดูแล" },
    { status: 401 }
  );
}
