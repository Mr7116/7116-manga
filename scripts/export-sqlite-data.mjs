import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function exportData() {
  console.log("📦 Exporting data from current SQLite database...");

  const mangas = await prisma.manga.findMany({
    include: {
      chapters: true,
    },
  });

  const watchlist = await prisma.watchedManga.findMany();

  const totalChapters = mangas.reduce((acc, m) => acc + m.chapters.length, 0);

  const backup = {
    exportedAt: new Date().toISOString(),
    mangasCount: mangas.length,
    chaptersCount: totalChapters,
    watchlistCount: watchlist.length,
    mangas,
    watchlist,
  };

  const outputPath = path.join(process.cwd(), "prisma", "backup-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2), "utf-8");

  console.log(`✅ Exported successfully to ${outputPath}`);
  console.log(`   - Mangas: ${mangas.length}`);
  console.log(`   - Chapters: ${totalChapters}`);
  console.log(`   - Watchlist: ${watchlist.length}`);
}

exportData()
  .catch((err) => {
    console.error("❌ Export failed:", err);
  })
  .finally(() => prisma.$disconnect());
