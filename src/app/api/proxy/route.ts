import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { safeFetch } from "@/lib/safeFetch";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * GET /api/proxy?url=<image url>
 * Admin-only image proxy (adds a Referer so hotlink-protected images load in the admin UI).
 * Refuses internal/private addresses and anything that isn't an image.
 */
export async function GET(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const imageUrl = req.nextUrl.searchParams.get("url");
  if (!imageUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    const target = new URL(imageUrl);
    const response = await safeFetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: target.origin,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.status}`, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return new NextResponse("Not an image", { status: 415 });
    }

    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_IMAGE_BYTES) {
      return new NextResponse("Image too large", { status: 413 });
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) {
      return new NextResponse("Image too large", { status: 413 });
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    return new NextResponse("Image proxy error: " + error.message, { status: 400 });
  }
}
