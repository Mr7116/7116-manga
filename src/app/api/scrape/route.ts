import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const maxDuration = 60;

// Helper to safely normalize Thai URLs and percent-encoded URLs
function normalizeThaiUrl(inputUrl: string): string {
  try {
    // Decode any pre-existing %XX to avoid double encoding, then encode properly
    const trimmed = inputUrl.trim();
    const decoded = decodeURI(trimmed);
    return encodeURI(decoded);
  } catch {
    return encodeURI(inputUrl.trim());
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "กรุณาระบุ URL ที่ถูกต้อง" },
        { status: 400 }
      );
    }

    const safeUrlString = normalizeThaiUrl(url);

    let targetUrl: URL;
    try {
      targetUrl = new URL(safeUrlString);
    } catch (e: any) {
      return NextResponse.json(
        { error: `รูปแบบ URL ไม่ถูกต้อง: ${e.message}` },
        { status: 400 }
      );
    }

    // Fetch webpage with realistic headers
    const response = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `ไม่สามารถเข้าถึง URL ได้ (HTTP Status: ${response.status})` },
        { status: response.status }
      );
    }

    // Read buffer and decode explicitly as UTF-8 to prevent any charset/encoding issues
    const arrayBuffer = await response.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(arrayBuffer);
    const $ = cheerio.load(html);

    // 1. EXTRACT TITLE
    let rawTitle =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("h1").first().text().trim() ||
      $("title").text().trim();

    // Clean common site suffixes (e.g. "| Go-Manga")
    let title = rawTitle
      .replace(/\s*\|\s*Go-Manga.*$/i, "")
      .replace(/\s*\|\s*เว็บอ่าน.*$/i, "")
      .replace(/\s*\|\s*.*$/, "")
      .replace(/^อ่านมังงะ\s+เรื่อง\s+/i, "")
      .replace(/^อ่านมังงะ\s+/i, "")
      .replace(/^มังงะ\s+เรื่อง\s+/i, "")
      .replace(/^มังงะ\s+/i, "")
      .replace(/\s+แปลไทย.*$/i, "")
      .trim();

    // 2. EXTRACT COVER IMAGE (Prioritize true series poster over chapter page 1)
    let cover = "";

    // Priority A: Check series thumbnail embedded in scripts e.g. "t":"https://.../cover.jpg"
    const seriesThumbnailMatch = html.match(/"t":\s*"([^"]+\.(?:jpg|jpeg|png|webp))"/i);
    if (seriesThumbnailMatch && seriesThumbnailMatch[1]) {
      cover = seriesThumbnailMatch[1].replace(/\\\/|\/\\/g, "/");
    }

    // Priority B: Check DOM cover selectors on series page
    if (!cover) {
      cover =
        $('.thumb img, .summary_image img, .cover img, .bigcontent img, .series-cover img, img[itemprop="image"]').first().attr("src") ||
        "";
    }

    // Priority C: Meta tags
    if (!cover) {
      cover =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content") ||
        "";
    }

    if (cover && !cover.startsWith("http")) {
      try {
        cover = new URL(cover, targetUrl.origin).toString();
      } catch {}
    }

    // 3. EXTRACT SYNOPSIS
    let synopsis =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      $(".entry-content p, .description p, .summary__content, .synopsis").first().text().trim() ||
      "ไม่มีเรื่องย่อ";

    // 4. EXTRACT READER IMAGES (Special Support for ts_reader on Go-Manga / MangaReader)
    let images: string[] = [];
    let nextUrl = "";
    let prevUrl = "";

    // Pattern A: Check for ts_reader.run({...})
    const tsReaderMatch = html.match(/ts_reader\.run\(([\s\S]*?)\);/);
    if (tsReaderMatch && tsReaderMatch[1]) {
      try {
        const readerData = JSON.parse(tsReaderMatch[1]);
        if (readerData.sources && Array.isArray(readerData.sources)) {
          for (const src of readerData.sources) {
            if (Array.isArray(src.images) && src.images.length > 0) {
              images = src.images;
              break;
            }
          }
        }
        if (readerData.nextUrl) nextUrl = readerData.nextUrl;
        if (readerData.prevUrl) prevUrl = readerData.prevUrl;
      } catch (err) {
        console.error("Failed to parse ts_reader JSON:", err);
      }
    }

    // Pattern B: Check for chapter_preloaded_images or general javascript image arrays
    if (images.length === 0) {
      const arrayMatch = html.match(/"images":\s*(\[[^\]]+\])/);
      if (arrayMatch && arrayMatch[1]) {
        try {
          const parsed = JSON.parse(arrayMatch[1]);
          if (Array.isArray(parsed)) {
            images = parsed;
          }
        } catch {}
      }
    }

    // Pattern C: Standard HTML DOM images
    if (images.length === 0) {
      $(
        "#readerarea img, .reading-content img, .page-break img, .chapter-image img, .container-chapter-reader img"
      ).each((_, el) => {
        let imgSrc =
          $(el).attr("data-src") ||
          $(el).attr("data-lazy-src") ||
          $(el).attr("src") ||
          $(el).attr("data-original");

        if (imgSrc) {
          imgSrc = imgSrc.trim();
          if (!imgSrc.startsWith("http")) {
            try {
              imgSrc = new URL(imgSrc, targetUrl.origin).toString();
            } catch {
              return;
            }
          }
          // Filter out ads / tracker gif / logo
          if (
            !imgSrc.includes(".gif") &&
            !imgSrc.includes("logo") &&
            !imgSrc.includes("banner") &&
            !imgSrc.includes("readerarea.svg") &&
            !images.includes(imgSrc)
          ) {
            images.push(imgSrc);
          }
        }
      });
    }

    // 5. EXTRACT CHAPTER LIST (If on Series / Manga Detail page or dropdown)
    const chapters: { title: string; url: string }[] = [];

    // Check chapter select dropdown
    $("select#chapter option, select.chapter-select option").each((_, el) => {
      const optVal = $(el).attr("value");
      const optText = $(el).text().trim();
      if (optVal && optVal.startsWith("http") && !optVal.includes("#")) {
        if (!chapters.some((c) => c.url === optVal)) {
          chapters.push({
            title: optText || "ตอน",
            url: optVal,
          });
        }
      }
    });

    // Check links on page
    if (chapters.length === 0) {
      $(".eplister a, .clplist a, ul.chapters a, .chapter-list a, .entry-content a").each((_, el) => {
        const linkHref = $(el).attr("href");
        const linkText = $(el).text().trim();
        if (
          linkHref &&
          (/ตอนที่|chapter|ch-|ep-/i.test(linkHref) || /ตอนที่|ตอน|chapter/i.test(linkText))
        ) {
          let fullUrl = linkHref;
          if (!fullUrl.startsWith("http")) {
            try {
              fullUrl = new URL(linkHref, targetUrl.origin).toString();
            } catch {
              return;
            }
          }
          if (
            !chapters.some((c) => c.url === fullUrl) &&
            linkText.length > 0 &&
            linkText.length < 120
          ) {
            chapters.push({
              title: linkText.replace(/\s+/g, " "),
              url: fullUrl,
            });
          }
        }
      });
    }

    // If it's a chapter page with images, use the first image as cover if cover not found
    if (!cover && images.length > 0) {
      cover = images[0];
    }

    return NextResponse.json({
      success: true,
      originalUrl: url,
      normalizedUrl: targetUrl.toString(),
      data: {
        title: title || rawTitle,
        cover,
        synopsis: synopsis.trim(),
        totalImagesFound: images.length,
        images, // Returns all chapter page images!
        totalChaptersFound: chapters.length,
        chapters: chapters,
        nextUrl,
        prevUrl,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการดึงข้อมูลจาก URL" },
      { status: 500 }
    );
  }
}
