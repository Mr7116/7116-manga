import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ChapterListSection from "@/components/ChapterListSection";
import MangaCard from "@/components/MangaCard";
import { getMangaBySlug, getRelatedMangas } from "@/lib/mangaService";
import {
  Star,
  Eye,
  BookOpen,
  User,
  Palette,
  Flame,
} from "lucide-react";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const manga = await getMangaBySlug(slug);
  if (!manga) return { title: "ไม่พบมังงะ - 7116-MANGA" };
  return {
    title: `${manga.title} แปลไทย อ่านฟรี - 7116-MANGA`,
    description: manga.synopsis,
  };
}

export default async function MangaDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const manga = await getMangaBySlug(slug);

  if (!manga) {
    notFound();
  }

  // Recommended mangas (exclude current)
  const relatedMangas = await getRelatedMangas(manga.slug, 5);

  const firstChapter = manga.chapters[manga.chapters.length - 1] || { number: 1 };
  const latestChapter = manga.chapters[0] || { number: 1 };

  return (
    <div className="relative min-h-screen bg-[#0b0e14] text-zinc-100 flex flex-col">
      {/* Background with Ambient Glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center opacity-25 filter blur-[2px]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1920&auto=format&fit=crop&q=80')",
        }}
      />
      <div className="fixed inset-0 pointer-events-none z-0 bg-gradient-to-b from-[#0b0e14]/80 via-[#0b0e14]/70 to-[#0b0e14]/95" />

      {/* Main Navbar */}
      <div className="relative z-20">
        <Navbar />
      </div>

      <main className="relative z-10 flex-1 py-8 px-3 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* Main Card Container */}
          <div className="rounded-xl border border-zinc-800/90 bg-[#1e2025]/95 shadow-2xl backdrop-blur-md p-5 sm:p-7">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              {/* Poster Cover */}
              <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center">
                <div className="w-52 sm:w-60 rounded-lg overflow-hidden shadow-2xl border border-zinc-700 bg-zinc-900">
                  <img
                    src={manga.cover}
                    alt={manga.title}
                    className="w-full h-auto object-cover aspect-[3/4.2]"
                  />
                </div>

                {/* Quick Action Buttons */}
                <div className="w-52 sm:w-60 mt-4 flex flex-col gap-2">
                  <Link
                    href={`/manga/${manga.slug}/${firstChapter.number}`}
                    className="flex items-center justify-center gap-2 rounded-md bg-[#46e39a] hover:bg-[#3cd089] py-2.5 text-xs font-bold text-zinc-950 shadow-md transition-colors"
                  >
                    <BookOpen className="h-4 w-4" /> เริ่มอ่านตอนแรก (Ch. {firstChapter.number})
                  </Link>

                  <Link
                    href={`/manga/${manga.slug}/${latestChapter.number}`}
                    className="flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-[#2b2d33] py-2 text-xs font-semibold text-zinc-200 hover:bg-[#383a42] hover:text-white transition-colors"
                  >
                    อ่านตอนล่าสุด (Ch. {latestChapter.number})
                  </Link>
                </div>
              </div>

              {/* Manga Info */}
              <div className="md:col-span-8 lg:col-span-9 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#d44837] px-2 py-0.5 text-[10px] font-black uppercase text-white shadow">
                    {manga.type}
                  </span>
                  {manga.isColor && (
                    <span className="rounded bg-[#facc15] px-1.5 py-0.5 text-[10px] font-black text-black shadow">
                      🎨 COLOR
                    </span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      manga.status === "Completed"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50"
                        : "bg-blue-950 text-blue-400 border border-blue-800/50"
                    }`}
                  >
                    {manga.status === "Completed" ? "จบแล้ว" : "ยังไม่จบ (Ongoing)"}
                  </span>
                  <span className="text-xs text-zinc-400">อัปเดต: {manga.updatedAt}</span>
                </div>

                <div>
                  <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                    {manga.title}
                  </h1>
                  {manga.thaiTitle && (
                    <p className="text-xs sm:text-sm text-[#46e39a] font-semibold mt-1">
                      {manga.thaiTitle}
                    </p>
                  )}
                </div>

                {/* Rating & Stats Bar */}
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-800 bg-[#16181d] p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 fill-[#f59e0b] text-[#f59e0b]" />
                    <span className="text-sm font-bold text-[#f59e0b]">{manga.rating}</span>
                    <span className="text-zinc-500">/ 10</span>
                  </div>

                  <div className="h-3.5 w-px bg-zinc-800" />

                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <Eye className="h-3.5 w-3.5 text-zinc-400" />
                    <span>{manga.views} วิว</span>
                  </div>

                  <div className="h-3.5 w-px bg-zinc-800" />

                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <User className="h-3.5 w-3.5 text-zinc-400" />
                    <span>ผู้แต่ง: <span className="text-white font-medium">{manga.author}</span></span>
                  </div>

                  <div className="h-3.5 w-px bg-zinc-800" />

                  <div className="flex items-center gap-1.5 text-zinc-300">
                    <Palette className="h-3.5 w-3.5 text-zinc-400" />
                    <span>ภาพ: <span className="text-white font-medium">{manga.artist}</span></span>
                  </div>
                </div>

                {/* Genres */}
                <div className="flex flex-wrap gap-1.5">
                  {manga.genres.map((g) => (
                    <span
                      key={g}
                      className="rounded bg-[#2b2d33] px-2.5 py-1 text-xs text-zinc-300 border border-zinc-700/60"
                    >
                      {g}
                    </span>
                  ))}
                </div>

                {/* Synopsis */}
                <div className="space-y-1.5 pt-2">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    เรื่องย่อ:
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed bg-[#16181d]/80 p-3.5 rounded-lg border border-zinc-800/80">
                    {manga.synopsis}
                  </p>
                </div>
              </div>
            </div>

            {/* Chapter List Section */}
            <div className="mt-8 border-t border-zinc-800/90 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-[#46e39a]" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    Chapter List (รายการตอนทั้งหมด)
                  </h2>
                </div>
                <span className="text-xs text-zinc-400">
                  {manga.chapters.length} ตอน
                </span>
              </div>

              <ChapterListSection manga={manga as any} />
            </div>

            {/* Recommended Manga Grid */}
            <div className="mt-10 border-t border-zinc-800/90 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Flame className="h-4 w-4 text-[#46e39a]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  มังงะเรื่องอื่นๆ ที่น่าสนใจ
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
                {relatedMangas.map((rm) => (
                  <MangaCard key={rm.id} manga={rm as any} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
