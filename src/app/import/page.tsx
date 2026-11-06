"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Download,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Image as ImageIcon,
  BookOpen,
  ChevronRight,
  Database,
  ArrowUpRight,
  Check,
  Play,
  Square,
  RefreshCw,
  Zap,
} from "lucide-react";

interface ScrapeResult {
  title?: string;
  cover?: string;
  synopsis?: string;
  totalChaptersFound?: number;
  chapters?: { title: string; url: string }[];
  totalImagesFound?: number;
  images?: string[];
  nextUrl?: string;
  prevUrl?: string;
}

interface SavedMangaResult {
  manga: {
    slug: string;
    title: string;
  };
  chapterNumber?: number;
}

interface BatchLog {
  title: string;
  chapterNumber: number;
  pagesCount: number;
  status: "running" | "success" | "error";
  error?: string;
}

export default function ImportPage() {
  const [url, setUrl] = useState("https://www.go-manga.com/third-rate-martial-family");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState<SavedMangaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [isReadingMode, setIsReadingMode] = useState(false);

  // Batch Auto-Scrape State
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, percent: 0, currentTitle: "" });
  const [batchLogs, setBatchLogs] = useState<BatchLog[]>([]);
  const cancelBatchRef = useRef(false);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSavedSuccess(null);
    setIsReadingMode(false);
    setBatchLogs([]);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "เกิดข้อผิดพลาดในการดึงข้อมูล");
      }

      setResult(data.data);
    } catch (err: any) {
      setError(err.message || "ไม่สามารถดึงข้อมูลได้ โปรดลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (!result || !result.title) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/manga/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          seriesUrl: url,
          title: result.title,
          cover: result.cover,
          synopsis: result.synopsis,
          images: result.images || [],
          chapters: result.chapters || [],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ไม่สามารถบันทึกลงฐานข้อมูลได้");
      }

      setSavedSuccess(data.data);
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  };

  // 🚀 BATCH AUTO-SCRAPE ALL CHAPTERS
  const handleStartBatchScrape = async () => {
    if (!result || !result.chapters || result.chapters.length === 0) return;

    setIsBatchRunning(true);
    cancelBatchRef.current = false;
    setBatchLogs([]);

    // Sort chapters from oldest (Chapter 1) to newest (e.g. Chapter 33)
    const sortedChapters = [...result.chapters].sort((a, b) => {
      const numA = parseFloat((a.title.match(/ตอนที่\s*(\d+(\.\d+)?)/i) || a.url.match(/ตอนที่-(\d+(\.\d+)?)/i) || [, 0])[1] as string) || 0;
      const numB = parseFloat((b.title.match(/ตอนที่\s*(\d+(\.\d+)?)/i) || b.url.match(/ตอนที่-(\d+(\.\d+)?)/i) || [, 0])[1] as string) || 0;
      return numA - numB;
    });

    const total = sortedChapters.length;
    setBatchProgress({ current: 0, total, percent: 0, currentTitle: "กำลังเริ่มต้น..." });

    // Step 1: Ensure main manga metadata is saved first
    try {
      await fetch("/api/manga/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          seriesUrl: url,
          title: result.title,
          cover: result.cover,
          synopsis: result.synopsis,
          chapters: result.chapters,
        }),
      });
    } catch {}

    // Step 2: Loop through each chapter one by one
    for (let i = 0; i < sortedChapters.length; i++) {
      if (cancelBatchRef.current) {
        break;
      }

      const ch = sortedChapters[i];
      const match = ch.title.match(/ตอนที่\s*(\d+(\.\d+)?)/i) || ch.url.match(/ตอนที่-(\d+(\.\d+)?)/i);
      const chNum = match ? parseFloat(match[1]) : i + 1;

      setBatchProgress({
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
        currentTitle: `กำลังดึง ${ch.title}...`,
      });

      // Add to logs as running
      setBatchLogs((prev) => [
        { title: ch.title, chapterNumber: chNum, pagesCount: 0, status: "running" },
        ...prev,
      ]);

      try {
        // Scrape this chapter
        const scrapeRes = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: ch.url }),
        });

        const scrapeData = await scrapeRes.json();
        if (!scrapeRes.ok || !scrapeData.success) {
          throw new Error(scrapeData.error || "ดึงข้อมูลตอนนี้ไม่สำเร็จ");
        }

        const chapterImages: string[] = scrapeData.data?.images || [];
        if (chapterImages.length === 0) {
          throw new Error("ไม่พบรูปภาพในตอนนี้ (อาจเป็นตอนที่ติดลิขสิทธิ์หรือเซิร์ฟเวอร์ปลายทางยังไม่ปล่อยภาพ)");
        }

        // Save this chapter into database
        const saveRes = await fetch("/api/manga/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: ch.url,
            seriesUrl: url,
            title: result.title,
            cover: result.cover,
            synopsis: result.synopsis,
            images: chapterImages,
            chapterNumber: chNum,
            chapterTitle: ch.title,
          }),
        });

        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(saveData.error || "บันทึกตอนนี้ไม่สำเร็จ");
        }

        // Update log to success
        setBatchLogs((prev) =>
          prev.map((log) =>
            log.chapterNumber === chNum
              ? { ...log, pagesCount: chapterImages.length, status: "success" }
              : log
          )
        );
      } catch (err: any) {
        // Update log to error
        setBatchLogs((prev) =>
          prev.map((log) =>
            log.chapterNumber === chNum
              ? { ...log, status: "error", error: err.message || "ผิดพลาด" }
              : log
          )
        );
      }

      // Small respectful delay between requests (400ms)
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    setIsBatchRunning(false);
  };

  const handleStopBatch = () => {
    cancelBatchRef.current = true;
    setIsBatchRunning(false);
  };

  const handleSampleClick = (sampleUrl: string) => {
    setUrl(sampleUrl);
  };

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

      {/* Navbar */}
      <div className="relative z-20">
        <Navbar />
      </div>

      <main className="relative z-10 flex-1 py-8 px-3 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Main Card Container */}
          <div className="rounded-xl border border-zinc-800/90 bg-[#1e2025]/95 shadow-2xl backdrop-blur-md p-5 sm:p-7">
            {/* Header */}
            <div className="border-b border-zinc-800/80 pb-4 mb-6">
              <div className="inline-flex items-center gap-1.5 rounded bg-[#46e39a]/15 px-2.5 py-1 text-xs font-bold text-[#46e39a] border border-[#46e39a]/30 mb-2">
                <Zap className="h-3.5 w-3.5" /> Auto-Crawler & Batch Importer (วนดึงทุกตอนอัตโนมัติ)
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-wide">
                ระบบดึงมังงะและวนดึงทุกตอนจนถึงตอนล่าสุด
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                ใส่ลิงก์หน้าหลักของเรื่อง ระบบจะตรวจจับตอนทั้งหมดและวนดึงรูปภาพทุกตอนมาบันทึกลง Database ให้ครบถ้วน
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-2">
                  วาง URL หน้ารวมมังงะ (หรือ URL ตอน):
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    required
                    placeholder="https://www.go-manga.com/third-rate-martial-family"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 rounded-md border border-zinc-700/80 bg-[#16181d] px-4 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#46e39a] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loading || isBatchRunning}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-[#46e39a] hover:bg-[#3cd089] px-6 py-2.5 text-xs sm:text-sm font-bold text-zinc-950 shadow transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> กำลังตรวจหาตอน...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" /> ดึงข้อมูลตอนนี้
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Sample Links */}
              <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[11px] text-zinc-400">ตัวอย่างคลิกทดสอบ:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleSampleClick("https://www.go-manga.com/third-rate-martial-family")
                  }
                  className="rounded bg-[#2b2d33] px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white hover:bg-[#383a42] border border-zinc-700/60 transition-colors"
                >
                  Go-Manga: หน้ารวมทุกตอน (33 ตอน)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSampleClick("https://www.go-manga.com/third-rate-martial-family-ตอนที่-1/")
                  }
                  className="rounded bg-[#2b2d33] px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white hover:bg-[#383a42] border border-zinc-700/60 transition-colors"
                >
                  Go-Manga: ตอนที่ 1 เดี่ยวๆ
                </button>
              </div>
            </form>

            {/* Error Message */}
            {error && (
              <div className="mt-5 flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Saved Notification Banner */}
            {savedSuccess && (
              <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 shadow-xl animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 font-bold">
                      <Check className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        บันทึกมังงะเข้าสู่ฐานข้อมูลเรียบร้อยแล้ว!
                      </h4>
                      <p className="text-xs text-emerald-300/80 mt-0.5">
                        เรื่อง &quot;{savedSuccess.manga.title}&quot; บันทึกลง SQLite แล้ว
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/manga/${savedSuccess.manga.slug}`}
                      className="flex items-center gap-1 rounded bg-[#2b2d33] hover:bg-[#383a42] px-3.5 py-2 text-xs font-bold text-zinc-200 border border-zinc-700 transition-colors"
                    >
                      ดูหน้ารายละเอียด <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>

                    {savedSuccess.chapterNumber !== undefined && (
                      <Link
                        href={`/manga/${savedSuccess.manga.slug}/${savedSuccess.chapterNumber}`}
                        className="flex items-center gap-1 rounded bg-[#46e39a] hover:bg-[#3cd089] px-4 py-2 text-xs font-bold text-zinc-950 shadow transition-colors"
                      >
                        <BookOpen className="h-3.5 w-3.5" /> เปิดอ่านตอนที่ {savedSuccess.chapterNumber}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Scrape Result Box */}
            {result && (
              <div className="mt-8 border-t border-zinc-800/90 pt-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-[#46e39a]" />
                    <h3 className="text-sm font-bold text-white">
                      ดึงข้อมูลสำเร็จ ({result.totalChaptersFound || 0} ตอนที่พบ)
                    </h3>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* BATCH BUTTON */}
                    {result.chapters && result.chapters.length > 0 && (
                      <button
                        onClick={handleStartBatchScrape}
                        disabled={isBatchRunning}
                        className={`flex items-center gap-1.5 rounded px-4 py-2 text-xs font-black shadow-lg transition-all cursor-pointer ${
                          isBatchRunning
                            ? "bg-amber-600 text-white cursor-wait"
                            : "bg-gradient-to-r from-emerald-500 via-teal-500 to-[#46e39a] hover:brightness-110 text-zinc-950 font-bold"
                        }`}
                      >
                        {isBatchRunning ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" /> กำลังวนดึงทุกตอน...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4 fill-zinc-950 text-zinc-950" /> วนดึงทุกตอนอัตโนมัติ (1 - {result.chapters.length})
                          </>
                        )}
                      </button>
                    )}

                    {/* SAVE SINGLE BUTTON */}
                    <button
                      onClick={handleSaveToDatabase}
                      disabled={saving || isBatchRunning || !!savedSuccess}
                      className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold shadow transition-all cursor-pointer ${
                        savedSuccess
                          ? "bg-emerald-600 text-white"
                          : "bg-[#2b2d33] hover:bg-[#383a42] text-zinc-200 border border-zinc-700"
                      }`}
                    >
                      <Database className="h-3.5 w-3.5" /> บันทึกเรื่องนี้
                    </button>
                  </div>
                </div>

                {/* BATCH PROGRESS BAR & MONITOR */}
                {(isBatchRunning || batchLogs.length > 0) && (
                  <div className="rounded-xl border border-zinc-700/80 bg-[#14171d] p-4 sm:p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isBatchRunning ? (
                          <Loader2 className="h-5 w-5 animate-spin text-[#46e39a]" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        )}
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            {isBatchRunning
                              ? "กำลังวนดึงภาพแต่ละตอนเข้าสู่ระบบ..."
                              : "ดึงและบันทึกครบทุกตอนสำเร็จเรียบร้อย!"}
                          </h4>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {batchProgress.currentTitle || `เสร็จสิ้น ${batchProgress.current} จาก ${batchProgress.total} ตอน`}
                          </p>
                        </div>
                      </div>

                      {isBatchRunning ? (
                        <button
                          onClick={handleStopBatch}
                          className="flex items-center gap-1 rounded bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
                        >
                          <Square className="h-3.5 w-3.5 fill-white" /> หยุดชั่วคราว
                        </button>
                      ) : (
                        <Link
                          href={`/manga/third-rate-martial-family`}
                          className="flex items-center gap-1 rounded bg-[#46e39a] hover:bg-[#3cd089] px-4 py-2 text-xs font-bold text-zinc-950 transition-colors shadow"
                        >
                          <BookOpen className="h-4 w-4" /> ดูหน้ารายละเอียด & อ่านทุกตอน
                        </Link>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-zinc-300">
                        <span>ความคืบหน้า ({batchProgress.current} / {batchProgress.total} ตอน)</span>
                        <span className="text-[#46e39a]">{batchProgress.percent}%</span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-[#46e39a] transition-all duration-300 ease-out"
                          style={{ width: `${batchProgress.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Live Scrape Logs List */}
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {batchLogs.map((log, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between rounded px-3 py-1.5 text-xs border ${
                            log.status === "success"
                              ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                              : log.status === "running"
                              ? "border-amber-500/40 bg-amber-950/20 text-amber-300 animate-pulse"
                              : "border-rose-500/30 bg-rose-950/20 text-rose-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {log.status === "success" && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                            {log.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400 shrink-0" />}
                            {log.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                            <span className="truncate font-semibold">{log.title}</span>
                          </div>

                          <div className="shrink-0 font-medium text-[11px] ml-2">
                            {log.status === "success" && `${log.pagesCount} หน้าภาพครบถ้วน`}
                            {log.status === "running" && "กำลังดึงรูปภาพ..."}
                            {log.status === "error" && (log.error || "เกิดข้อผิดพลาด")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detail Overview Card */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-[#16181d] p-4 rounded-xl border border-zinc-800">
                  {/* Cover */}
                  {result.cover && (
                    <div className="md:col-span-3 flex flex-col items-center">
                      <div className="w-36 sm:w-44 rounded-md overflow-hidden border border-zinc-700 shadow-md aspect-[3/4.2] bg-zinc-900">
                        <img
                          src={result.cover}
                          alt="Cover"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                  )}

                  {/* Text Details */}
                  <div className={`${result.cover ? "md:col-span-9" : "md:col-span-12"} space-y-3`}>
                    <div>
                      <span className="text-[10px] font-bold text-[#46e39a] uppercase tracking-wider">
                        ชื่อเรื่อง / ตอนที่ตรวจพบ:
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
                        {result.title}
                      </h2>
                    </div>

                    {result.synopsis && result.synopsis !== "ไม่มีเรื่องย่อ" && (
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          เรื่องย่อ:
                        </span>
                        <p className="text-xs text-zinc-300 mt-1 leading-relaxed bg-[#1e2025] p-3 rounded border border-zinc-800">
                          {result.synopsis}
                        </p>
                      </div>
                    )}

                    {/* Stats Badges */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {result.totalImagesFound ? (
                        <div className="flex items-center gap-1.5 rounded bg-[#2b2d33] px-3 py-1.5 text-xs text-zinc-200 border border-zinc-700/60">
                          <ImageIcon className="h-3.5 w-3.5 text-[#46e39a]" />
                          <span className="font-bold">{result.totalImagesFound}</span> หน้าอ่าน
                        </div>
                      ) : null}

                      {result.totalChaptersFound ? (
                        <div className="flex items-center gap-1.5 rounded bg-[#2b2d33] px-3 py-1.5 text-xs text-zinc-200 border border-zinc-700/60">
                          <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
                          <span>พบ <span className="font-bold">{result.totalChaptersFound}</span> ตอน</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* CHAPTERS LIST (IF DETECTED) */}
                {result.chapters && result.chapters.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-zinc-800">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-zinc-200">
                        รายชื่อตอนที่ตรวจพบ ({result.chapters.length} ตอน):
                      </h4>
                      <button
                        onClick={handleStartBatchScrape}
                        disabled={isBatchRunning}
                        className="text-xs text-[#46e39a] hover:underline font-bold"
                      >
                        ⚡ วนดึงทั้งหมด {result.chapters.length} ตอน
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {result.chapters.map((ch, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded border border-zinc-800 bg-[#16181d] px-3 py-2 text-xs"
                        >
                          <span className="truncate text-zinc-300 font-medium">{ch.title}</span>
                          <button
                            onClick={() => {
                              setUrl(ch.url);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="text-xs text-[#46e39a] hover:underline ml-2 font-bold shrink-0"
                          >
                            ดึงตอนนี้
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
