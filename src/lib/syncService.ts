import { prisma } from "./prisma";
import { revalidatePath } from "next/cache";
import { findMatchingMangaSlug, newMangaDefaults, scrapedMetaUpdate } from "./mangaService";
import { slugFromUrl, slugify } from "./slug";
import { normalizeThaiUrl, scrapeChapterImages, scrapePage } from "./scraper";

export { normalizeThaiUrl, scrapeChapterImages };

const PLACEHOLDER_COVER = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600";

/** Total time one sync run may spend scraping. Route maxDuration is 60s, so keep headroom. */
export const SYNC_TIME_BUDGET_MS = Number(process.env.SYNC_TIME_BUDGET_MS) || 40_000;
/** Watched manga checked per scheduled run (oldest-synced first, so all get rotated through). */
export const SYNC_BATCH_SIZE = Number(process.env.SYNC_BATCH_SIZE) || 3;
/** Max new chapters downloaded per manga per run (the rest are picked up on later runs). */
// The time budget is the real limit; this cap just stops one huge backlog from starving the batch.
export const SYNC_MAX_NEW_CHAPTERS = Number(process.env.SYNC_MAX_NEW_CHAPTERS) || 8;

// Smart incremental sync for a single manga series URL
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

  // 1. Scrape the series page (10s timeout inside fetchHtml)
  const page = await scrapePage(safeUrl);
  const { title, cover, synopsis } = page;

  // 2. Resolve slug: explicit > existing watchlist entry > URL > title (+ exact-title cross-source match)
  let slug = options?.targetSlug || "";
  if (!slug) {
    const existingWatch = await prisma.watchedManga.findUnique({
      where: { url: safeUrl },
      select: { slug: true },
    });
    if (existingWatch?.slug && existingWatch.slug !== "pending-import") {
      slug = existingWatch.slug;
    } else {
      slug = await findMatchingMangaSlug(slugFromUrl(safeUrl) || slugify(title), title);
    }
  }

  // Only chapters with a parseable number can be stored
  const webChapters = page.chapters.filter(
    (c): c is typeof c & { number: number } => c.number !== null
  );
  const latestWebChapter = webChapters.length > 0 ? Math.max(...webChapters.map((c) => c.number)) : 0;

  // 3. Ensure Manga record exists (don't touch updatedAt during routine checks)
  const existingManga = await prisma.manga.findUnique({ where: { slug } });
  const isPosterCover = cover && !cover.includes("-ep") && !cover.includes("-ตอนที่-");
  const shouldUpdateCover =
    !!cover &&
    (!existingManga?.cover ||
      existingManga.cover.includes("-ep") ||
      existingManga.cover.includes("-ตอนที่-") ||
      (isPosterCover && existingManga.cover !== cover));

  const meta = {
    genres: page.genres,
    type: page.type,
    status: page.status,
    author: page.author,
    artist: page.artist,
  };

  let mangaRecord = existingManga;
  if (!mangaRecord) {
    mangaRecord = await prisma.manga.create({
      data: {
        slug,
        title,
        thaiTitle: title,
        cover: cover || PLACEHOLDER_COVER,
        banner: cover || null,
        synopsis: synopsis || null,
        latestChapter: latestWebChapter || 1,
        ...newMangaDefaults(meta),
      },
    });
  } else {
    // Fill in real metadata whenever the source page provides it
    const metaUpdate = scrapedMetaUpdate(meta);
    const hasMeta = Object.values(metaUpdate).some((v) => v !== undefined);
    if (shouldUpdateCover || hasMeta) {
      mangaRecord = await prisma.manga.update({
        where: { id: mangaRecord.id },
        data: {
          ...(shouldUpdateCover
            ? {
                cover,
                banner: cover,
                synopsis: synopsis && synopsis !== "ไม่มีเรื่องย่อ" ? synopsis : undefined,
              }
            : {}),
          ...metaUpdate,
          // keep sort position stable: Prisma's @updatedAt would otherwise bump it
          updatedAt: mangaRecord.updatedAt,
        },
      });
    }
  }

  // 4. Incremental dedup: chapters that already have pages are skipped
  const existingDbChapters = await prisma.chapter.findMany({
    where: { mangaId: mangaRecord.id },
    select: { number: true, pages: true },
  });

  const completedChapterSet = new Set<number>();
  for (const c of existingDbChapters) {
    try {
      const p = JSON.parse(c.pages || "[]");
      if (Array.isArray(p) && p.length > 0) completedChapterSet.add(c.number);
    } catch {}
  }

  const missingChapters = webChapters
    .filter((ch) => !completedChapterSet.has(ch.number))
    .sort((a, b) => a.number - b.number); // oldest missing first

  const chaptersToDownload = options?.maxNewChapters
    ? missingChapters.slice(0, options.maxNewChapters)
    : missingChapters;

  const downloadedChapters: number[] = [];
  const failedChapters: number[] = []; // page loaded but no images found / request failed

  // 5. Download only new/missing chapters, within the time budget
  for (const ch of chaptersToDownload) {
    if (options?.startTime && Date.now() - options.startTime > (options.maxDurationMs || SYNC_TIME_BUDGET_MS)) {
      break;
    }
    try {
      const pages = await scrapeChapterImages(ch.url);
      if (pages.length > 0) {
        await prisma.chapter.upsert({
          where: { mangaId_number: { mangaId: mangaRecord.id, number: ch.number } },
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
      } else {
        failedChapters.push(ch.number);
      }
    } catch (err) {
      console.error(`Failed to scrape chapter ${ch.number}:`, err);
      failedChapters.push(ch.number);
    }
    await new Promise((r) => setTimeout(r, 300)); // be polite to the source site
  }

  // New chapters (or explicit request) bump the manga to the top of the home page
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
      revalidatePath(`/manga/${slug}`);
      // chapter pages are cached for an hour; refresh the ones we (re)downloaded
      for (const n of downloadedChapters) revalidatePath(`/manga/${slug}/${n}`);
    } catch {}
  }

  const allDbChapterNumbers = Array.from(completedChapterSet).concat(downloadedChapters);
  const latestDbChapterNumber = allDbChapterNumbers.length > 0 ? Math.max(...allDbChapterNumbers) : 0;

  // 6. Update watchlist entry. Always advance lastSyncedAt so a manga whose chapters can't be
  // scraped doesn't hog the front of the rotation; failed chapters are retried on its next turn
  // and reported in lastError.
  const syncError =
    failedChapters.length > 0
      ? `ดึงรูปไม่ได้ ${failedChapters.length} ตอน: ${failedChapters
          .slice(0, 10)
          .map((n) => `ตอนที่ ${n}`)
          .join(", ")}${failedChapters.length > 10 ? " …" : ""}`
      : null;

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
      lastSyncedAt: new Date(),
      lastError: syncError,
    },
    update: {
      slug,
      title,
      cover: cover || undefined,
      latestChapterOnWeb: latestWebChapter,
      latestChapterInDb: latestDbChapterNumber,
      lastSyncedAt: new Date(),
      lastError: syncError,
    },
  });

  return {
    title,
    slug,
    totalWebChapters: webChapters.length,
    skippedExistingChapters: completedChapterSet.size,
    newChaptersDownloaded: downloadedChapters.length,
    downloadedChapterNumbers: downloadedChapters,
    failedChapterNumbers: failedChapters,
    remainingMissingChapters: missingChapters.length - downloadedChapters.length,
    latestChapterOnWeb: latestWebChapter,
  };
}

// Sync the active watchlist (oldest-synced first) within a fixed time budget
export async function syncAllWatchedMangas(options?: { maxNewChapters?: number; limit?: number }) {
  const startTime = Date.now();
  const maxChapters = typeof options?.maxNewChapters === "number" ? options.maxNewChapters : SYNC_MAX_NEW_CHAPTERS;
  const limit = options?.limit !== undefined ? options.limit : SYNC_BATCH_SIZE; // 0 = all

  const watchlist = await prisma.watchedManga.findMany({
    where: { status: "active" },
    orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }, { updatedAt: "asc" }],
    take: limit > 0 ? limit : undefined,
  });

  const results: any[] = [];
  for (const item of watchlist) {
    if (Date.now() - startTime > SYNC_TIME_BUDGET_MS) break;
    try {
      const res = await syncMangaFromUrl(item.url, {
        maxNewChapters: maxChapters,
        startTime,
        maxDurationMs: SYNC_TIME_BUDGET_MS,
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

// ---------------------------------------------------------------------------
// Run lock: prevents two sync runs (e.g. pg_cron tick + manual button) from
// scraping the same chapters at the same time. Stored in SystemSetting.
// A lock older than LOCK_TTL is considered stale (crashed/timed-out run).
// ---------------------------------------------------------------------------
const LOCK_KEY = "sync_run_lock";
const LOCK_TTL_MS = 90_000;

export async function acquireSyncLock(): Promise<string | null> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const staleBefore = new Date(Date.now() - LOCK_TTL_MS);
  // Atomic: insert, or take over only if the existing lock is stale
  const rows = await prisma.$queryRaw<{ key: string }[]>`
    INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
    VALUES (${LOCK_KEY}, ${token}, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = EXCLUDED."value", "updatedAt" = NOW()
      WHERE "SystemSetting"."updatedAt" < ${staleBefore}
    RETURNING "key"
  `;
  return rows.length > 0 ? token : null;
}

export async function releaseSyncLock(token: string) {
  await prisma.systemSetting.deleteMany({ where: { key: LOCK_KEY, value: token } });
}
