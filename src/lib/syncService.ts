import { prisma } from "./prisma";
import * as cheerio from "cheerio";
import { slugify, findMatchingMangaSlug } from "./mangaService";
import { revalidatePath } from "next/cache";

// Helper to safely normalize Thai URLs
export function normalizeThaiUrl(inputUrl: string): string {
  try {
    const trimmed = inputUrl.trim();
    const decoded = decodeURI(trimmed);
    return encodeURI(decoded);
  } catch {
    return encodeURI(inputUrl.trim());
  }
}

// Scrape a single chapter's images
export async function scrapeChapterImages(chapterUrl: string): Promise<string[]> {
  const safeUrl = normalizeThaiUrl(chapterUrl);
  try {
    const response = await fetch(safeUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 },
    });

    if (!response.ok) return [];

    const buffer = await response.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buffer);

    // Pattern A: ts_reader.run
    const tsReaderMatch = html.match(/ts_reader\.run\(([\s\S]*?)\);/);
    if (tsReaderMatch && tsReaderMatch[1]) {
      try {
        const data = JSON.parse(tsReaderMatch[1]);
        if (data.sources && Array.isArray(data.sources)) {
          for (const src of data.sources) {
            if (Array.isArray(src.images) && src.images.length > 0) {
              return src.images;
            }
          }
        }
      } catch {}
    }

    // Pattern B: DOM images
    const $ = cheerio.load(html);
    const images: string[] = [];
    $("#readerarea img, .reading-content img").each((_, el) => {
      const src = $(el).attr("data-src") || $(el).attr("src");
      if (src && !src.includes(".gif") && !src.includes("logo") && !src.includes("readerarea.svg")) {
        images.push(src);
      }
    });

    return images;
  } catch {
    return [];
  }
}

// Smart Incremental Sync Engine for a Single Manga URL
export async function syncMangaFromUrl(
  seriesUrl: string,
  options?: {
    maxNewChapters?: number;
    targetSlug?: string;
    startTime?: number;
    maxDurationMs?: number;
    forceBump?: boolean;
  }
) {
  const safeUrl = normalizeThaiUrl(seriesUrl);

  // 1. Fetch series main page with 3.5s timeout
  const response = await fetch(safeUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`ไม่สามารถเข้าถึง URL ได้ (HTTP Status: ${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const html = new TextDecoder("utf-8").decode(buffer);
  const $ = cheerio.load(html);

  // Extract Series Info
  let rawTitle =
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  let title = rawTitle
    .replace(/\s*\|\s*Go-Manga.*$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/ตอนที่\s*\d+.*$/i, "")
    .replace(/^อ่านมังงะ\s+เรื่อง\s+/i, "")
    .replace(/^อ่านมังงะ\s+/i, "")
    .replace(/^มังงะ\s+เรื่อง\s+/i, "")
    .replace(/^มังงะ\s+/i, "")
    .replace(/\s+แปลไทย.*$/i, "")
    .trim();

  // Extract True Series Poster Cover
  let cover = "";
  const tMatch = html.match(/"t":\s*"([^"]+\.(?:jpg|jpeg|png|webp))"/i);
  if (tMatch && tMatch[1]) {
    cover = tMatch[1].replace(/\\\/|\/\\/g, "/");
  }
  if (!cover) {
    cover =
      $('.thumb img, .summary_image img, .cover img, .series-cover img').first().attr("src") ||
      $('meta[property="og:image"]').attr("content") ||
      "";
  }

  let synopsis =
    $('meta[property="og:description"]').attr("content") ||
    $(".entry-content p").first().text().trim() ||
    "";

  // Derive Slug
  let slug = options?.targetSlug || "";
  if (!slug) {
    try {
      const urlObj = new URL(safeUrl);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        slug = slugify(decodeURIComponent(pathParts[0]).replace(/[-_](?:ตอนที่|ตอน|chapter|ch|ep)[-_]?\d+.*$/i, ""));
      }
    } catch {}
    if (!slug) slug = slugify(title);

    // Cross-source Smart Matching: check if this URL maps to an existing WatchedManga or matches by title
    const existingWatch = await prisma.watchedManga.findUnique({
      where: { url: safeUrl },
      select: { slug: true },
    });
    if (existingWatch?.slug) {
      slug = existingWatch.slug;
    } else {
      slug = await findMatchingMangaSlug(slug, title);
    }
  }

  // Extract all chapters available on web
  const webChapters: { number: number; title: string; url: string; releaseDate?: string }[] = [];
  $(".eplister li, .clplist li, ul.chapters li, .chapter-list li, .eplister a, .clplist a, select#chapter option").each((_, el) => {
    const $el = $(el);
    const linkEl = $el.is("a") ? $el : $el.find("a").first();
    const linkHref = linkEl.attr("href") || $el.attr("value");
    const numText = $el.find(".chapternum").text().trim() || linkEl.text().trim() || $el.text().trim();
    const dateText = $el.find(".chapterdate").text().trim();

    if (linkHref && (linkHref.includes("chapter") || linkHref.includes("ตอนที่") || /ตอนที่|\bch\b/i.test(numText))) {
      let fullUrl = linkHref;
      if (!fullUrl.startsWith("http")) {
        try {
          fullUrl = new URL(linkHref, safeUrl).toString();
        } catch {
          return;
        }
      }
      const match = numText.match(/ตอนที่\s*(\d+(\.\d+)?)/i) || fullUrl.match(/ตอนที่-(\d+(\.\d+)?)/i);
      if (match && match[1]) {
        const num = parseFloat(match[1]);
        if (!webChapters.some((c) => c.number === num)) {
          webChapters.push({
            number: num,
            title: `ตอนที่ ${num}`,
            url: fullUrl,
            releaseDate: dateText || undefined,
          });
        }
      }
    }
  });

  const latestWebChapter = webChapters.length > 0 ? Math.max(...webChapters.map((c) => c.number)) : 1;

  // 2. Ensure Manga Record exists in DB (avoid touching updatedAt on existing manga during routine cron checks)
  const existingManga = await prisma.manga.findUnique({ where: { slug } });
  const isPosterCover = cover && !cover.includes("-ep") && !cover.includes("-ตอนที่-");
  const shouldUpdateCover = cover && (!existingManga?.cover || existingManga.cover.includes("-ep") || existingManga.cover.includes("-ตอนที่-") || (isPosterCover && existingManga.cover !== cover));

  let mangaRecord = existingManga;
  if (!mangaRecord) {
    mangaRecord = await prisma.manga.create({
      data: {
        slug,
        title,
        thaiTitle: title,
        cover: cover || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600",
        banner: cover || null,
        synopsis,
        status: "Ongoing",
        type: "MANHWA",
        isColor: true,
        genres: "Action,Fantasy,พระเอกเทพ",
        latestChapter: latestWebChapter,
      },
    });
  } else if (shouldUpdateCover && mangaRecord) {
    mangaRecord = await prisma.manga.update({
      where: { id: mangaRecord.id },
      data: {
        cover,
        banner: cover,
        synopsis: (synopsis && synopsis !== "ไม่มีเรื่องย่อ") ? synopsis : undefined,
      },
    });
  }

  // 3. SMART INCREMENTAL DEDUPLICATION
  // Find all chapters in DB for this manga that ALREADY have pages
  const existingDbChapters = await prisma.chapter.findMany({
    where: { mangaId: mangaRecord.id },
    select: { number: true, pages: true },
  });

  const completedChapterSet = new Set<number>();
  for (const c of existingDbChapters) {
    try {
      const p = JSON.parse(c.pages || "[]");
      if (Array.isArray(p) && p.length > 0) {
        completedChapterSet.add(c.number);
      }
    } catch {}
  }

  // Filter ONLY missing or new chapters!
  const missingChapters = webChapters
    .filter((ch) => !completedChapterSet.has(ch.number))
    .sort((a, b) => a.number - b.number); // Scrape oldest missing first

  const chaptersToDownload = options?.maxNewChapters
    ? missingChapters.slice(0, options.maxNewChapters)
    : missingChapters;

  const downloadedChapters: number[] = [];

  // 4. Download only new/missing chapters
  for (const ch of chaptersToDownload) {
    if (options?.startTime && Date.now() - options.startTime > (options.maxDurationMs || 25000)) {
      break;
    }
    try {
      const pages = await scrapeChapterImages(ch.url);
      if (pages.length > 0) {
        await prisma.chapter.upsert({
          where: {
            mangaId_number: {
              mangaId: mangaRecord.id,
              number: ch.number,
            },
          },
          create: {
            number: ch.number,
            title: ch.title,
            pages: JSON.stringify(pages),
            releaseDate: ch.releaseDate || "วันนี้",
            mangaId: mangaRecord.id,
          },
          update: {
            pages: JSON.stringify(pages),
            title: ch.title,
            releaseDate: ch.releaseDate ? ch.releaseDate : undefined,
          },
        });
        downloadedChapters.push(ch.number);
      }
    } catch (err) {
      console.error(`Failed to scrape chapter ${ch.number}:`, err);
    }
    // Small delay between chapters
    await new Promise((r) => setTimeout(r, 300));
  }

  // If new chapters were downloaded or forceBump requested, refresh manga updatedAt so it bumps to the top-left!
  if (downloadedChapters.length > 0 || options?.forceBump) {
    await prisma.manga.update({
      where: { id: mangaRecord.id },
      data: {
        updatedAt: new Date(),
        latestChapter: Math.max(...downloadedChapters, mangaRecord.latestChapter),
      },
    });
    try {
      revalidatePath("/");
    } catch {}
  }

  // Count current chapters in DB with downloaded images
  const totalDbChapters = completedChapterSet.size + downloadedChapters.length;
  const allDbChapterNumbers = Array.from(completedChapterSet).concat(downloadedChapters);
  const latestDbChapterNumber = allDbChapterNumbers.length > 0 ? Math.max(...allDbChapterNumbers) : 0;

  // 5. Update or Upsert WatchedManga Record
  const hasUnresolvedChapters = missingChapters.length > 0 && downloadedChapters.length === 0;

  await prisma.watchedManga.upsert({
    where: { url: safeUrl },
    create: {
      url: safeUrl,
      slug,
      title,
      cover: cover || mangaRecord.cover,
      status: "active",
      latestChapterOnWeb: latestWebChapter,
      latestChapterInDb: latestDbChapterNumber,
      lastSyncedAt: hasUnresolvedChapters ? undefined : new Date(),
    },
    update: {
      title,
      cover: cover || undefined,
      latestChapterOnWeb: latestWebChapter,
      latestChapterInDb: latestDbChapterNumber,
      lastSyncedAt: hasUnresolvedChapters ? undefined : new Date(),
      lastError: null,
    },
  });

  return {
    title,
    slug,
    totalWebChapters: webChapters.length,
    skippedExistingChapters: completedChapterSet.size,
    newChaptersDownloaded: downloadedChapters.length,
    downloadedChapterNumbers: downloadedChapters,
    latestChapterOnWeb: latestWebChapter,
  };
}

// Sync active watched mangas in the watchlist with safe time budget
export async function syncAllWatchedMangas(options?: { maxNewChapters?: number; limit?: number }) {
  const startTime = Date.now();
  const TIME_BUDGET_MS = 25000; // Allow sufficient time for scraping new chapters within 60s maxDuration
  const maxChapters = typeof options?.maxNewChapters === "number" ? options.maxNewChapters : 2;
  const limit = options?.limit !== undefined ? options.limit : 2; // Process 1-2 mangas per run

  const watchlist = await prisma.watchedManga.findMany({
    where: { status: "active" },
    orderBy: [
      { lastSyncedAt: { sort: "asc", nulls: "first" } },
      { updatedAt: "asc" },
    ],
    take: limit > 0 ? limit : undefined,
  });

  const results: any[] = [];
  for (const item of watchlist) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      break;
    }
    try {
      const res = await syncMangaFromUrl(item.url, {
        maxNewChapters: maxChapters,
        startTime,
        maxDurationMs: TIME_BUDGET_MS,
      });
      results.push({ url: item.url, success: true, ...res });
    } catch (err: any) {
      await prisma.watchedManga.update({
        where: { id: item.id },
        data: { lastError: err.message || "Sync failed", lastSyncedAt: new Date() },
      });
      results.push({ url: item.url, title: item.title, success: false, error: err.message });
    }
  }

  return results;
}
