"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useQueue, BatchQueueItem } from "@/context/QueueContext";
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
  FastForward,
  ListFilter,
  ListChecks,
  ExternalLink,
  Clock,
  Trash2,
  Cloud,
} from "lucide-react";

interface ScrapeResult {
  title?: string;
  cover?: string;
  synopsis?: string;
  totalChaptersFound?: number;
  chapters?: { title: string; url: string; number?: number | null; releaseDate?: string }[];
  totalImagesFound?: number;
  images?: string[];
  chapterNumber?: number | null;
  genres?: string[];
  type?: string;
  status?: string;
  author?: string;
  artist?: string;
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
  status: "running" | "success" | "error" | "skipped";
  error?: string;
}

export default function ImportPage() {
  const [url, setUrl] = useState("https://www.go-manga.com/third-rate-martial-family");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState<SavedMangaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [existingChapters, setExistingChapters] = useState<number[]>([]);
  const [isReadingMode, setIsReadingMode] = useState(false);

  // Single URL Batch Auto-Scrape State
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, percent: 0, currentTitle: "" });
  const [batchLogs, setBatchLogs] = useState<BatchLog[]>([]);
  const cancelBatchRef = useRef(false);

  // Global Multi-URL Queue Context (persists across page changes!)
  const {
    queueItems,
    isQueueRunning,
    queueProgress,
    startQueue,
    cancelQueue,
    clearQueue,
  } = useQueue();

  // Multi-URL Batch List Local Controls
  const [importMode, setImportMode] = useState<"single" | "batch_list">("single");
  const [batchUrlsInput, setBatchUrlsInput] = useState<string>("");
  const [autoAddToWatchlist, setAutoAddToWatchlist] = useState<boolean>(true);
  const [batchScrapeDepth, setBatchScrapeDepth] = useState<"all" | "recent" | "meta_only">("all");
  const [cloudQueueLoading, setCloudQueueLoading] = useState<boolean>(false);
  const [cloudQueueSuccess, setCloudQueueSuccess] = useState<string | null>(null);

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

      // Check existing chapters in DB
      try {
        const checkRes = await fetch(
          `/api/manga/existing-chapters?url=${encodeURIComponent(url.trim())}&title=${encodeURIComponent(data.data?.title || "")}`
        );
        const checkData = await checkRes.json();
        if (checkData.success && Array.isArray(checkData.existingNumbers)) {
          setExistingChapters(checkData.existingNumbers);
        } else {
          setExistingChapters([]);
        }
      } catch {
        setExistingChapters([]);
      }
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
          chapterNumber: typeof result.chapterNumber === "number" ? result.chapterNumber : undefined,
          genres: result.genres,
          type: result.type,
          status: result.status,
          author: result.author,
          artist: result.artist,
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

    // Step 1: Ensure main manga metadata is saved first, and get existing chapters from DB
    let existingChapterSet = new Set<number>();
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
          genres: result.genres,
          type: result.type,
          status: result.status,
          author: result.author,
          artist: result.artist,
        }),
      });

      const checkRes = await fetch(
        `/api/manga/existing-chapters?url=${encodeURIComponent(url)}&title=${encodeURIComponent(result.title || "")}`
      );
      const checkData = await checkRes.json();
      if (checkData.success && Array.isArray(checkData.existingNumbers)) {
        existingChapterSet = new Set(checkData.existingNumbers);
        setExistingChapters(checkData.existingNumbers);
      }
    } catch {}

    // Step 2: Loop through each chapter one by one
    for (let i = 0; i < sortedChapters.length; i++) {
      if (cancelBatchRef.current) {
        break;
      }

      const ch = sortedChapters[i];
      const match = ch.title.match(/ตอนที่\s*(\d+(\.\d+)?)/i) || ch.url.match(/ตอนที่-(\d+(\.\d+)?)/i);
      const chNum = match ? parseFloat(match[1]) : i + 1;

      // ⏩ ถ้าเคยมีอยู่ในระบบแล้ว ข้ามทันที (ไม่ต้องดึงหรือบันทึกซ้ำ)
      if (existingChapterSet.has(chNum)) {
        setBatchProgress({
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          currentTitle: `ข้าม ${ch.title} (มีในระบบแล้ว)`,
        });

        setBatchLogs((prev) => [
          { title: ch.title, chapterNumber: chNum, pagesCount: 0, status: "skipped" },
          ...prev,
        ]);

        continue;
      }

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

  const parseBatchUrls = (text: string): string[] => {
    return Array.from(
      new Set(
        text
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("http://") || line.startsWith("https://"))
      )
    );
  };

  const handleStartQueue = async () => {
    const urls = parseBatchUrls(batchUrlsInput);
    if (urls.length === 0) {
      setError("กรุณากรอก URL อย่างน้อย 1 รายการ (ขึ้นต้นด้วย http:// หรือ https://)");
      return;
    }

    setError(null);
    setCloudQueueSuccess(null);
    await startQueue(urls, {
      autoWatchlist: autoAddToWatchlist,
      depth: batchScrapeDepth,
    });
  };

  const handleSendToCloudQueue = async () => {
    const urls = parseBatchUrls(batchUrlsInput);
    if (urls.length === 0) {
      setError("กรุณากรอก URL อย่างน้อย 1 รายการ (ขึ้นต้นด้วย http:// หรือ https://)");
      return;
    }

    setCloudQueueLoading(true);
    setError(null);
    setCloudQueueSuccess(null);

    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "ไม่สามารถส่งข้อมูลเข้าคิวหลังบ้านได้");
      }

      setCloudQueueSuccess(
        `✓ ส่ง ${data.count || urls.length} เรื่องเข้าสู่คิวระบบหลังบ้านเรียบร้อยแล้ว! ระบบ Cloud Cron และ Background Worker จะทยอยดึงข้อมูลและดาวน์โหลดตอนใหม่อยู่เบื้องหลังตลอด 24 ชม. คุณสามารถปิดเว็บไปทำอย่างอื่นได้ทันทีครับ`
      );
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setCloudQueueLoading(false);
    }
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

            {/* Mode Selector Tabs */}
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 pb-3 mb-6">
              <button
                type="button"
                onClick={() => setImportMode("single")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  importMode === "single"
                    ? "bg-[#46e39a] text-zinc-950 shadow-md shadow-[#46e39a]/20"
                    : "bg-[#16181d] text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>ดึงทีละเรื่อง (Single URL)</span>
              </button>
              <button
                type="button"
                onClick={() => setImportMode("batch_list")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  importMode === "batch_list"
                    ? "bg-[#46e39a] text-zinc-950 shadow-md shadow-[#46e39a]/20"
                    : "bg-[#16181d] text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <ListFilter className="h-3.5 w-3.5" />
                <span>วางรายชื่อหลายเรื่อง (Multi-URL List & Auto Watchlist)</span>
                <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[10px] font-black">
                  NEW
                </span>
              </button>
            </div>

            {/* TAB 1: MULTI-URL BATCH QUEUE */}
            {importMode === "batch_list" && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-zinc-300">
                      วาง URL มังงะที่ต้องการนำเข้า (วางได้หลายเรื่อง บรรทัดละ 1 URL):
                    </label>
                    <span className="text-[11px] font-bold text-[#46e39a] bg-[#46e39a]/10 px-2.5 py-0.5 rounded-full border border-[#46e39a]/30">
                      ตรวจพบ {parseBatchUrls(batchUrlsInput).length} รายการ
                    </span>
                  </div>

                  <textarea
                    rows={6}
                    disabled={isQueueRunning}
                    placeholder={`https://www.up-manga.com/revenge-of-the-baskerville/\nhttps://www.go-manga.com/infinite-mage/\nhttps://www.up-manga.com/nano-machine/`}
                    value={batchUrlsInput}
                    onChange={(e) => setBatchUrlsInput(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700/80 bg-[#16181d] p-3.5 text-xs sm:text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:border-[#46e39a] focus:outline-none transition-colors"
                  />
                </div>

                {/* Preset & Options Toolbar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs bg-[#16181d]/80 p-3.5 rounded-xl border border-zinc-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-zinc-400">ใส่ตัวอย่างทดสอบ:</span>
                    <button
                      type="button"
                      disabled={isQueueRunning}
                      onClick={() =>
                        setBatchUrlsInput(
                          "https://www.up-manga.com/revenge-of-the-baskerville/\nhttps://www.go-manga.com/third-rate-martial-family/\nhttps://www.up-manga.com/regression-yong-clan-heir/"
                        )
                      }
                      className="rounded-lg bg-[#2b2d33] px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white hover:bg-[#383a42] border border-zinc-700/60 transition-colors"
                    >
                      ใส่ตัวอย่าง 3 เรื่อง
                    </button>
                    {batchUrlsInput && (
                      <button
                        type="button"
                        disabled={isQueueRunning}
                        onClick={() => setBatchUrlsInput("")}
                        className="text-[11px] text-zinc-400 hover:text-rose-400 underline transition-colors ml-1"
                      >
                        ล้างกล่องข้อความ
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoAddToWatchlist}
                        onChange={(e) => setAutoAddToWatchlist(e.target.checked)}
                        disabled={isQueueRunning}
                        className="rounded accent-[#46e39a] w-4 h-4 cursor-pointer"
                      />
                      <span className="text-zinc-200 font-bold text-xs">
                        เพิ่มเข้า Watchlist อัตโนมัติทุกเรื่อง
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5 bg-[#111317] px-3 py-1.5 rounded-lg border border-zinc-700">
                      <span className="text-zinc-400">ความลึก:</span>
                      <select
                        value={batchScrapeDepth}
                        onChange={(e: any) => setBatchScrapeDepth(e.target.value)}
                        disabled={isQueueRunning}
                        className="bg-transparent text-[#46e39a] font-bold focus:outline-none cursor-pointer text-xs"
                      >
                        <option value="all" className="bg-zinc-900 text-white">ดึงทุกตอน (ข้ามตอนเดิมอัตโนมัติ)</option>
                        <option value="recent" className="bg-zinc-900 text-white">ดึง 5 ตอนล่าสุด</option>
                        <option value="meta_only" className="bg-zinc-900 text-white">บันทึกเรื่อง + Watchlist ทันที (ยังไม่โหลดรูป)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Queue Control Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  {!isQueueRunning ? (
                    <>
                      <button
                        type="button"
                        onClick={handleStartQueue}
                        disabled={parseBatchUrls(batchUrlsInput).length === 0}
                        className="flex items-center justify-center gap-2 rounded-xl bg-[#46e39a] hover:bg-[#3cd089] px-5 py-3 text-xs sm:text-sm font-black text-zinc-950 shadow-lg shadow-[#46e39a]/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Zap className="h-4 w-4" />
                        <span>
                          เริ่มดึงสดผ่านหน้าเว็บ ({parseBatchUrls(batchUrlsInput).length} เรื่อง)
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSendToCloudQueue}
                        disabled={cloudQueueLoading || parseBatchUrls(batchUrlsInput).length === 0}
                        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:brightness-110 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-purple-500/25 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {cloudQueueLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                            <span>กำลังส่งเข้าคิว...</span>
                          </>
                        ) : (
                          <>
                            <Cloud className="h-4 w-4" />
                            <span>
                              ส่งเข้าคิวหลังบ้าน (Cloud Cron ทยอยดึง 24 ชม. - ปิดเว็บได้ทันที)
                            </span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={cancelQueue}
                      className="flex items-center justify-center gap-2 rounded-xl bg-rose-500 hover:bg-rose-600 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer animate-pulse"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      <span>หยุดทำงานชั่วคราว / ยกเลิกคิว</span>
                    </button>
                  )}

                  {!isQueueRunning && queueItems.length > 0 && (
                    <button
                      type="button"
                      onClick={clearQueue}
                      className="flex items-center gap-1.5 rounded-xl bg-[#202228] hover:bg-[#2b2d35] px-4 py-3 text-xs sm:text-sm font-bold text-zinc-300 border border-zinc-700/60 transition-colors"
                    >
                      <Trash2 className="h-4 w-4 text-zinc-400" />
                      <span>ล้างรายการคิว</span>
                    </button>
                  )}
                </div>

                {/* Cloud Queue Success Banner */}
                {cloudQueueSuccess && (
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-purple-500/40 bg-purple-950/30 p-4 text-xs text-purple-200 shadow-lg">
                    <div className="flex items-center gap-2.5">
                      <Cloud className="h-5 w-5 shrink-0 text-purple-400" />
                      <span>{cloudQueueSuccess}</span>
                    </div>
                    <Link
                      href="/watchlist"
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors"
                    >
                      <span>ดูรายการใน Watchlist</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs text-rose-300">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>{error}</span>
                  </div>
                )}

                {/* QUEUE CARDS & PROGRESS */}
                {queueItems.length > 0 && (
                  <div className="mt-8 border-t border-zinc-800 pt-6 space-y-4">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-white flex items-center gap-2">
                        <ListChecks className="h-4 w-4 text-[#46e39a]" />
                        <span>ความคืบหน้ารวม: เรื่องที่ {queueProgress.current} จาก {queueProgress.total}</span>
                      </span>
                      <span className="text-[#46e39a]">{queueProgress.percent}%</span>
                    </div>

                    <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-[#46e39a] transition-all duration-300"
                        style={{ width: `${queueProgress.percent}%` }}
                      />
                    </div>

                    {/* Queue items list */}
                    <div className="space-y-2.5 mt-5">
                      {queueItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`p-4 rounded-xl border transition-all ${
                            item.status === "downloading_chapters" || item.status === "scraping_meta" || item.status === "saving_manga"
                              ? "bg-[#181d24] border-[#46e39a]/60 shadow-lg"
                              : item.status === "success"
                              ? "bg-[#141b18] border-emerald-500/30"
                              : item.status === "error"
                              ? "bg-[#201518] border-rose-500/30"
                              : "bg-[#16181d] border-zinc-800/80"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3.5 min-w-0">
                              <span className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                                {idx + 1}
                              </span>
                              {item.cover ? (
                                <img
                                  src={item.cover}
                                  alt={item.title || ""}
                                  className="w-10 h-14 object-cover rounded-md shadow shrink-0 border border-zinc-700/60"
                                />
                              ) : (
                                <div className="w-10 h-14 bg-zinc-800 rounded-md flex items-center justify-center text-[10px] text-zinc-500 shrink-0">
                                  No Pic
                                </div>
                              )}
                              <div className="min-w-0">
                                <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                                  {item.title || item.url}
                                </h4>
                                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                  {item.statusText}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                              {item.status === "success" && (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  ✓ สำเร็จ
                                </span>
                              )}
                              {(item.status === "downloading_chapters" || item.status === "scraping_meta" || item.status === "saving_manga") && (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> กำลังประมวลผล
                                </span>
                              )}
                              {item.status === "idle" && (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400">
                                  ⏳ รอดำเนินการ
                                </span>
                              )}
                              {item.status === "error" && (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                  ❌ ไม่สำเร็จ
                                </span>
                              )}
                              {item.slug && (
                                <Link
                                  href={`/manga/${item.slug}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 hover:text-white transition-colors border border-zinc-700"
                                >
                                  <span>เปิดดู</span>
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SINGLE URL FORM */}
            {importMode === "single" && (
              <>
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
                              : log.status === "skipped"
                              ? "border-cyan-500/30 bg-cyan-950/20 text-cyan-300"
                              : log.status === "running"
                              ? "border-amber-500/40 bg-amber-950/20 text-amber-300 animate-pulse"
                              : "border-rose-500/30 bg-rose-950/20 text-rose-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {log.status === "success" && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                            {log.status === "skipped" && <FastForward className="h-3.5 w-3.5 text-cyan-400 shrink-0" />}
                            {log.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400 shrink-0" />}
                            {log.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                            <span className="truncate font-semibold">{log.title}</span>
                          </div>

                          <div className="shrink-0 font-medium text-[11px] ml-2">
                            {log.status === "success" && `${log.pagesCount} หน้าภาพครบถ้วน`}
                            {log.status === "skipped" && "ข้าม (มีในระบบแล้ว)"}
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
                        {existingChapters.length > 0 && (
                          <span className="text-[#46e39a] ml-2 font-normal">
                            (มีในระบบแล้ว {existingChapters.length} ตอน)
                          </span>
                        )}
                      </h4>
                      <button
                        onClick={handleStartBatchScrape}
                        disabled={isBatchRunning}
                        className="text-xs text-[#46e39a] hover:underline font-bold"
                      >
                        {existingChapters.length > 0
                          ? `⚡ วนดึงเฉพาะตอนใหม่ (ข้าม ${existingChapters.length} ตอนเดิมอัตโนมัติ)`
                          : `⚡ วนดึงทั้งหมด ${result.chapters.length} ตอน`}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {result.chapters.map((ch, idx) => {
                        const match = ch.title.match(/ตอนที่\s*(\d+(\.\d+)?)/i) || ch.url.match(/ตอนที่-(\d+(\.\d+)?)/i);
                        const chNum = match ? parseFloat(match[1]) : idx + 1;
                        const isAlreadyDownloaded = existingChapters.includes(chNum);

                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between rounded border px-3 py-2 text-xs ${
                              isAlreadyDownloaded
                                ? "border-emerald-500/30 bg-emerald-950/20"
                                : "border-zinc-800 bg-[#16181d]"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              {isAlreadyDownloaded && (
                                <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              )}
                              <span className={`truncate font-medium ${isAlreadyDownloaded ? "text-emerald-300" : "text-zinc-300"}`}>
                                {ch.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              {isAlreadyDownloaded && (
                                <span className="text-[10px] text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-500/40">
                                  มีในระบบแล้ว
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  setUrl(ch.url);
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className="text-xs text-[#46e39a] hover:underline font-bold"
                              >
                                {isAlreadyDownloaded ? "ดึงซ้ำ" : "ดึงตอนนี้"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
              </>
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
