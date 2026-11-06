"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Maximize2,
  Minimize2,
  ArrowUp,
  Settings2,
} from "lucide-react";
import { Manga, Chapter } from "@/data/manga";
import { markChapterAsRead } from "@/lib/readingHistory";

interface MangaReaderProps {
  manga: Manga;
  currentChapter: Chapter;
}

export default function MangaReader({ manga, currentChapter }: MangaReaderProps) {
  const router = useRouter();

  // Mark chapter as read immediately on mount or chapter change
  useEffect(() => {
    if (manga?.slug && currentChapter?.number !== undefined) {
      markChapterAsRead(manga.slug, currentChapter.number);
    }
  }, [manga?.slug, currentChapter?.number]);

  // Reader Settings State
  const [readingMode, setReadingMode] = useState<"vertical" | "single">("vertical");
  const [maxWidth, setMaxWidth] = useState<"narrow" | "medium" | "full">("medium");
  const [bgColor, setBgColor] = useState<"black" | "dark" | "white">("black");
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Find previous and next chapter
  const sortedChapters = [...manga.chapters].sort((a, b) => a.number - b.number);
  const currentIndex = sortedChapters.findIndex((c) => c.number === currentChapter.number);
  const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (readingMode === "single") {
        if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
          if (currentPage < currentChapter.pages.length - 1) {
            setCurrentPage((p) => p + 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (nextChapter) {
            router.push(`/manga/${manga.slug}/${nextChapter.number}`);
          }
        } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
          if (currentPage > 0) {
            setCurrentPage((p) => p - 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (prevChapter) {
            router.push(`/manga/${manga.slug}/${prevChapter.number}`);
          }
        }
      }
    },
    [readingMode, currentPage, currentChapter.pages.length, nextChapter, prevChapter, router, manga.slug]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const widthClasses = {
    narrow: "max-w-2xl",
    medium: "max-w-4xl",
    full: "max-w-6xl",
  };

  const bgClasses = {
    black: "bg-black text-zinc-100",
    dark: "bg-[#0b0e14] text-zinc-100",
    white: "bg-zinc-100 text-zinc-900",
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 ${bgClasses[bgColor]}`}>
      {/* Top Header / Sticky Navigation Bar */}
      <div className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-[#14171d]/95 backdrop-blur-md px-3 sm:px-6 py-2.5 text-zinc-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          {/* Left: Back & Title info */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/manga/${manga.slug}`}
              className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#46e39a] hover:underline transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">รายละเอียดเรื่อง</span>
            </Link>

            <span className="text-zinc-600 hidden sm:inline">|</span>

            <div className="truncate">
              <span className="font-bold text-xs sm:text-sm text-white truncate block sm:inline">
                {manga.title}
              </span>
              <span className="text-[11px] sm:text-xs text-[#46e39a] sm:ml-2 font-medium">
                {currentChapter.title}
              </span>
            </div>
          </div>

          {/* Right: Controls & Selectors */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Chapter Selector Dropdown */}
            <select
              value={currentChapter.number}
              onChange={(e) => router.push(`/manga/${manga.slug}/${e.target.value}`)}
              className="rounded bg-[#22242a] border border-zinc-700 px-2 py-1 text-xs font-semibold text-zinc-200 focus:border-[#46e39a] focus:outline-none"
            >
              {sortedChapters.map((ch) => (
                <option key={ch.id} value={ch.number}>
                  ตอนที่ {ch.number}
                </option>
              ))}
            </select>

            {/* Prev / Next buttons */}
            <div className="flex items-center">
              <button
                disabled={!prevChapter}
                onClick={() => prevChapter && router.push(`/manga/${manga.slug}/${prevChapter.number}`)}
                className={`rounded-l border border-zinc-700 bg-[#22242a] p-1.5 text-xs ${
                  prevChapter ? "hover:bg-[#32353e] text-zinc-200" : "opacity-40 cursor-not-allowed text-zinc-500"
                }`}
                title="ตอนก่อนหน้า"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                disabled={!nextChapter}
                onClick={() => nextChapter && router.push(`/manga/${manga.slug}/${nextChapter.number}`)}
                className={`rounded-r border-t border-b border-r border-zinc-700 bg-[#22242a] p-1.5 text-xs ${
                  nextChapter ? "hover:bg-[#32353e] text-zinc-200" : "opacity-40 cursor-not-allowed text-zinc-500"
                }`}
                title="ตอนถัดไป"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Settings Toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded border p-1.5 transition-colors ${
                showSettings
                  ? "border-[#46e39a] bg-[#46e39a]/20 text-[#46e39a]"
                  : "border-zinc-700 bg-[#22242a] text-zinc-400 hover:text-white"
              }`}
              title="ตั้งค่าการอ่าน"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="hidden sm:flex rounded border border-zinc-700 bg-[#22242a] p-1.5 text-zinc-400 hover:text-white"
              title="เต็มจอ"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Reader Settings Drawer */}
        {showSettings && (
          <div className="mx-auto mt-2 max-w-6xl rounded-lg border border-zinc-800 bg-[#1e2025] p-3 text-xs shadow-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Reading Mode */}
              <div>
                <label className="text-zinc-400 font-semibold block mb-1">โหมดการอ่าน</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setReadingMode("vertical")}
                    className={`flex-1 rounded py-1 px-2 font-medium border text-center ${
                      readingMode === "vertical"
                        ? "border-[#46e39a] bg-[#46e39a]/20 text-[#46e39a]"
                        : "border-zinc-700 bg-[#2b2d33] text-zinc-400 hover:text-white"
                    }`}
                  >
                    เว็บตูน (เลื่อนยาว)
                  </button>
                  <button
                    onClick={() => setReadingMode("single")}
                    className={`flex-1 rounded py-1 px-2 font-medium border text-center ${
                      readingMode === "single"
                        ? "border-[#46e39a] bg-[#46e39a]/20 text-[#46e39a]"
                        : "border-zinc-700 bg-[#2b2d33] text-zinc-400 hover:text-white"
                    }`}
                  >
                    ทีละหน้า (สไลด์)
                  </button>
                </div>
              </div>

              {/* Reader Width */}
              <div>
                <label className="text-zinc-400 font-semibold block mb-1">ความกว้างหน้าอ่าน</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setMaxWidth("narrow")}
                    className={`flex-1 rounded py-1 px-2 font-medium border text-center ${
                      maxWidth === "narrow"
                        ? "border-[#46e39a] bg-[#46e39a]/20 text-[#46e39a]"
                        : "border-zinc-700 bg-[#2b2d33] text-zinc-400 hover:text-white"
                    }`}
                  >
                    แคบ
                  </button>
                  <button
                    onClick={() => setMaxWidth("medium")}
                    className={`flex-1 rounded py-1 px-2 font-medium border text-center ${
                      maxWidth === "medium"
                        ? "border-[#46e39a] bg-[#46e39a]/20 text-[#46e39a]"
                        : "border-zinc-700 bg-[#2b2d33] text-zinc-400 hover:text-white"
                    }`}
                  >
                    ปานกลาง
                  </button>
                  <button
                    onClick={() => setMaxWidth("full")}
                    className={`flex-1 rounded py-1 px-2 font-medium border text-center ${
                      maxWidth === "full"
                        ? "border-[#46e39a] bg-[#46e39a]/20 text-[#46e39a]"
                        : "border-zinc-700 bg-[#2b2d33] text-zinc-400 hover:text-white"
                    }`}
                  >
                    เต็มจอ
                  </button>
                </div>
              </div>

              {/* Background theme */}
              <div>
                <label className="text-zinc-400 font-semibold block mb-1">สีพื้นหลัง</label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setBgColor("black")}
                    className={`flex-1 rounded py-1 px-2 font-medium border text-center ${
                      bgColor === "black"
                        ? "border-[#46e39a] bg-black text-[#46e39a]"
                        : "border-zinc-700 bg-black text-zinc-400"
                    }`}
                  >
                    ดำ
                  </button>
                  <button
                    onClick={() => setBgColor("dark")}
                    className={`flex-1 rounded py-1 px-2 font-medium border text-center ${
                      bgColor === "dark"
                        ? "border-[#46e39a] bg-[#14171d] text-[#46e39a]"
                        : "border-zinc-700 bg-[#14171d] text-zinc-400"
                    }`}
                  >
                    เทา
                  </button>
                  <button
                    onClick={() => setBgColor("white")}
                    className={`flex-1 rounded py-1 px-2 font-medium border text-center ${
                      bgColor === "white"
                        ? "border-[#46e39a] bg-white text-zinc-900 font-bold"
                        : "border-zinc-300 bg-white text-zinc-700"
                    }`}
                  >
                    ขาว
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Manga Reader Canvas */}
      <main className="mx-auto w-full py-4 sm:py-6">
        {/* VERTICAL WEBTOON MODE */}
        {readingMode === "vertical" && (
          <div className={`mx-auto ${widthClasses[maxWidth]} flex flex-col items-center shadow-2xl`}>
            {currentChapter.pages.map((pageUrl, idx) => (
              <div key={idx} className="relative w-full overflow-hidden bg-black leading-none">
                <img
                  src={pageUrl}
                  alt={`หน้า ${idx + 1}`}
                  className="w-full h-auto block select-none m-0 p-0"
                  loading={idx < 3 ? "eager" : "lazy"}
                  decoding="async"
                />
              </div>
            ))}
          </div>
        )}

        {/* SINGLE PAGE MODE */}
        {readingMode === "single" && (
          <div className={`mx-auto ${widthClasses[maxWidth]} flex flex-col items-center px-2`}>
            <div className="relative w-full rounded-md overflow-hidden bg-zinc-900 shadow-2xl">
              <img
                src={currentChapter.pages[currentPage]}
                alt={`หน้า ${currentPage + 1}`}
                className="w-full h-auto max-h-[85vh] object-contain mx-auto select-none"
              />

              <button
                onClick={() => {
                  if (currentPage > 0) setCurrentPage((p) => p - 1);
                }}
                disabled={currentPage === 0}
                className="absolute left-0 top-0 bottom-0 w-1/3 opacity-0 hover:opacity-20 bg-gradient-to-r from-white to-transparent cursor-w-resize"
              />
              <button
                onClick={() => {
                  if (currentPage < currentChapter.pages.length - 1) setCurrentPage((p) => p + 1);
                }}
                disabled={currentPage === currentChapter.pages.length - 1}
                className="absolute right-0 top-0 bottom-0 w-1/3 opacity-0 hover:opacity-20 bg-gradient-to-l from-white to-transparent cursor-e-resize"
              />
            </div>

            {/* Single Mode Navigation Pagination */}
            <div className="mt-4 flex items-center justify-between w-full max-w-md gap-3 px-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className={`flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold border ${
                  currentPage === 0
                    ? "border-zinc-800 bg-[#1e2025] text-zinc-600 cursor-not-allowed"
                    : "border-zinc-700 bg-[#2b2d33] text-zinc-200 hover:bg-[#383a42]"
                }`}
              >
                <ChevronLeft className="h-4 w-4" /> ก่อนหน้า
              </button>

              <span className="text-xs font-bold text-[#46e39a]">
                หน้า {currentPage + 1} จาก {currentChapter.pages.length}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(currentChapter.pages.length - 1, p + 1))}
                disabled={currentPage === currentChapter.pages.length - 1}
                className={`flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold border ${
                  currentPage === currentChapter.pages.length - 1
                    ? "border-zinc-800 bg-[#1e2025] text-zinc-600 cursor-not-allowed"
                    : "border-zinc-700 bg-[#2b2d33] text-zinc-200 hover:bg-[#383a42]"
                }`}
              >
                ถัดไป <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Navigation */}
        <div className="mx-auto mt-8 max-w-xl px-4 text-center">
          <div className="rounded-xl border border-zinc-800 bg-[#1e2025] p-5 shadow-lg">
            <h3 className="text-xs sm:text-sm font-bold text-white mb-1">
              อ่านจบ {currentChapter.title} แล้ว
            </h3>
            <p className="text-[11px] text-zinc-400 mb-4">
              {manga.title}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {prevChapter && (
                <Link
                  href={`/manga/${manga.slug}/${prevChapter.number}`}
                  className="rounded border border-zinc-700 bg-[#2b2d33] px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-[#383a42]"
                >
                  <ChevronLeft className="inline h-3.5 w-3.5 mr-1" /> ตอนที่ {prevChapter.number}
                </Link>
              )}

              <Link
                href={`/manga/${manga.slug}`}
                className="rounded border border-zinc-700 bg-[#16181d] px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-[#202228]"
              >
                <List className="inline h-3.5 w-3.5 mr-1" /> รายการตอน
              </Link>

              {nextChapter ? (
                <Link
                  href={`/manga/${manga.slug}/${nextChapter.number}`}
                  className="rounded bg-[#46e39a] hover:bg-[#3cd089] px-4 py-2 text-xs font-bold text-zinc-950 shadow"
                >
                  อ่านตอนต่อไป ({nextChapter.number}) <ChevronRight className="inline h-3.5 w-3.5 ml-1" />
                </Link>
              ) : (
                <span className="rounded bg-[#2b2d33] px-3.5 py-2 text-xs font-semibold text-zinc-500">
                  รอตอนใหม่
                </span>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Floating Action Button for Scroll to Top */}
      <div className="fixed bottom-6 right-6 z-30">
        <button
          onClick={scrollToTop}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#46e39a] text-zinc-950 shadow-xl shadow-black/50 hover:bg-[#3cd089] hover:scale-105 transition-all"
          title="เลื่อนขึ้นบนสุด"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
