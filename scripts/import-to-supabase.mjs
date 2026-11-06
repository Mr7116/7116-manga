import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function importData() {
  const backupPath = path.join(process.cwd(), "prisma", "backup-data.json");
  if (!fs.existsSync(backupPath)) {
    console.error("❌ File not found:", backupPath);
    return;
  }

  const raw = fs.readFileSync(backupPath, "utf-8");
  const data = JSON.parse(raw);

  console.log(`🚀 Starting migration to new Database (Supabase PostgreSQL)...`);
  console.log(`   - Mangas to import: ${data.mangas.length}`);
  console.log(`   - Chapters to import: ${data.chaptersCount}`);
  console.log(`   - Watchlist to import: ${data.watchlist.length}`);

  // 1. Import Mangas & Chapters
  for (const m of data.mangas) {
    console.log(`\n⏳ Importing Manga: ${m.title} (${m.slug})...`);
    
    // Create/Upsert Manga
    const mangaRecord = await prisma.manga.upsert({
      where: { slug: m.slug },
      create: {
        id: m.id,
        slug: m.slug,
        title: m.title,
        thaiTitle: m.thaiTitle,
        nativeTitle: m.nativeTitle,
        cover: m.cover,
        banner: m.banner,
        synopsis: m.synopsis,
        status: m.status,
        type: m.type,
        isColor: m.isColor,
        genres: m.genres,
        rating: m.rating,
        ratingCount: m.ratingCount,
        views: m.views,
        author: m.author,
        artist: m.artist,
        latestChapter: m.latestChapter,
      },
      update: {
        title: m.title,
        cover: m.cover,
        latestChapter: m.latestChapter,
      },
    });

    console.log(`   ✅ Manga saved. Inserting ${m.chapters.length} chapters...`);

    // Insert chapters in chunks
    for (const c of m.chapters) {
      await prisma.chapter.upsert({
        where: {
          mangaId_number: {
            mangaId: mangaRecord.id,
            number: c.number,
          },
        },
        create: {
          id: c.id,
          number: c.number,
          title: c.title,
          pages: c.pages,
          releaseDate: c.releaseDate,
          mangaId: mangaRecord.id,
        },
        update: {
          pages: c.pages,
          title: c.title,
        },
      });
    }
    console.log(`   🎉 Finished chapters for ${m.title}`);
  }

  // 2. Import Watchlist
  console.log(`\n⏳ Importing ${data.watchlist.length} watchlist items...`);
  for (const w of data.watchlist) {
    await prisma.watchedManga.upsert({
      where: { url: w.url },
      create: {
        id: w.id,
        url: w.url,
        slug: w.slug,
        title: w.title,
        cover: w.cover,
        status: w.status,
        latestChapterOnWeb: w.latestChapterOnWeb,
        latestChapterInDb: w.latestChapterInDb,
        lastSyncedAt: w.lastSyncedAt ? new Date(w.lastSyncedAt) : null,
        lastError: w.lastError,
      },
      update: {
        latestChapterInDb: w.latestChapterInDb,
        latestChapterOnWeb: w.latestChapterOnWeb,
      },
    });
  }

  console.log("\n=======================================================");
  console.log("🎉 ALL DATA SUCCESSFULLY RESTORED TO SUPABASE POSTGRES!");
  console.log("=======================================================");
}

importData()
  .catch((err) => {
    console.error("❌ Migration error:", err);
  })
  .finally(() => prisma.$disconnect());
