"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  Clock,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Flame,
  Terminal,
  ArrowLeft,
  ChevronRight,
  Home,
} from "lucide-react";

interface WatchedItem {
  id: string;
  url: string;
  slug: string;
  title: string;
  cover?: string;
  status: "active" | "paused" | "error";
  latestChapterOnWeb: number;
  latestChapterInDb: number;
  totalChaptersInDb: number;
  lastSyncedAt?: string;
  lastError?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warn" | "error";
  message: string;
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputUrl, setInputUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Auto-Scheduler States (Persistent)
  const [autoScheduleActive, setAutoScheduleActive] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [secondsRemaining, setSecondsRemaining] = useState(30 * 60);
  const [nextSyncAt, setNextSyncAt] = useState<string | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);

  // Activity Logs
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init",
      timestamp: new Date().toLocaleTimeString("th-TH"),
      type: "info",
      message: "ระบบเฝ้าติดตามและตั้งเวลาดึงข้อมูลอัตโนมัติพร้อมทำงาน",
    },
  ]);

  const addLog = (message: string, type: "info" | "success" | "warn" | "error" = "info") => {
    setLogs((prev) => [
      {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toLocaleTimeString("th-TH"),
        type,
        message,
      },
      ...prev.slice(0, 49),
    ]);
  };

  // Fetch watchlist data
  const fetchWatchlist = async () => {
    try {
      const res = await fetch("/api/watchlist");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setWatchlist(data.data);
      }
    } catch (err: any) {
      addLog(`เกิดข้อผิดพลาดในการโหลดรายการติดตาม: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch scheduler status from server/DB
  const fetchSchedulerConfig = async () => {
    try {
      // First try localStorage for instant UI responsiveness
      const cached = typeof window !== "undefined" ? localStorage.getItem("manga_scheduler_config") : null;
      if (cached) {
        try {
          const c = JSON.parse(cached);
          setAutoScheduleActive(Boolean(c.enabled));
          setIntervalMinutes(c.intervalMinutes || 30);
          setNextSyncAt(c.nextSyncAt || null);
          if (c.enabled && c.nextSyncAt) {
            const diffSec = Math.max(0, Math.round((new Date(c.nextSyncAt).getTime() - Date.now()) / 1000));
            setSecondsRemaining(diffSec);
          }
        } catch {}
      }

      // Then fetch authoritative state from DB
      const res = await fetch("/api/scheduler");
      const json = await res.json();
      if (json.success && json.data) {
        setAutoScheduleActive(json.data.enabled);
        setIntervalMinutes(json.data.intervalMinutes);
        setNextSyncAt(json.data.nextSyncAt);
        localStorage.setItem("manga_scheduler_config", JSON.stringify(json.data));

        if (json.data.enabled && json.data.nextSyncAt) {
          const diffSec = Math.max(0, Math.round((new Date(json.data.nextSyncAt).getTime() - Date.now()) / 1000));
          setSecondsRemaining(diffSec);
        } else {
          setSecondsRemaining(json.data.intervalMinutes * 60);
        }
      }
    } catch (err) {
      console.error("Failed to load scheduler config", err);
    }
  };

  useEffect(() => {
    fetchWatchlist();
    fetchSchedulerConfig();

    const handleSyncFinished = (e: any) => {
      fetchWatchlist();
      fetchSchedulerConfig();
      if (e?.detail?.data) {
        addLog(`📦 [Scheduler] ซิงค์ข้อมูลอัตโนมัติสำเร็จ: ตรวจสอบ ${e.detail.data.length} เรื่อง`, "success");
      }
    };

    const handleSchedulerUpdated = () => {
      fetchSchedulerConfig();
    };

    window.addEventListener("manga-sync-finished", handleSyncFinished);
    window.addEventListener("manga-scheduler-updated", handleSchedulerUpdated);
    window.addEventListener("storage", handleSchedulerUpdated);

    return () => {
      window.removeEventListener("manga-sync-finished", handleSyncFinished);
      window.removeEventListener("manga-scheduler-updated", handleSchedulerUpdated);
      window.removeEventListener("storage", handleSchedulerUpdated);
    };
  }, []);

  // Auto-Scheduler Timer Effect
  useEffect(() => {
    if (!autoScheduleActive) {
      setSecondsRemaining(intervalMinutes * 60);
      return;
    }

    const timer = setInterval(() => {
      if (nextSyncAt) {
        const diffSec = Math.round((new Date(nextSyncAt).getTime() - Date.now()) / 1000);
        if (diffSec <= 0) {
          setSecondsRemaining(0);
          triggerAutoSync();
        } else {
          setSecondsRemaining(diffSec);
        }
      } else {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            triggerAutoSync();
            return intervalMinutes * 60;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [autoScheduleActive, intervalMinutes, nextSyncAt]);

  // Trigger sync all
  const triggerAutoSync = async () => {
    addLog(`⏰ [Scheduler] เริ่มต้นรอบการซิงค์อัตโนมัติตามกำหนดเวลา...`, "info");
    await handleSyncAll();
    await fetchSchedulerConfig();
  };

  // Toggle scheduler on/off (persisted in DB)
  const handleToggleScheduler = async () => {
    setSchedulerLoading(true);
    const targetState = !autoScheduleActive;

    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: targetState,
          intervalMinutes,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setAutoScheduleActive(json.data.enabled);
        setNextSyncAt(json.data.nextSyncAt);
        localStorage.setItem("manga_scheduler_config", JSON.stringify(json.data));

        if (json.data.enabled && json.data.nextSyncAt) {
          const diffSec = Math.max(0, Math.round((new Date(json.data.nextSyncAt).getTime() - Date.now()) / 1000));
          setSecondsRemaining(diffSec);
          addLog(
            `✅ เปิดใช้งานระบบตั้งเวลาซิงค์อัตโนมัติแล้ว (ทุก ${json.data.intervalMinutes} นาที) - สถานะนี้จะเปิดค้างไว้ตลอดไปจนกว่าจะกดปิดเอง`,
            "success"
          );
        } else {
          setSecondsRemaining(intervalMinutes * 60);
          addLog(`⏸ ปิดระบบตั้งเวลาซิงค์อัตโนมัติแล้ว`, "warn");
        }

        window.dispatchEvent(new Event("manga-scheduler-updated"));
      } else {
        throw new Error(json.error || "เกิดข้อผิดพลาดในการบันทึก");
      }
    } catch (err: any) {
      addLog(`❌ บันทึกสถานะตั้งเวลาไม่สำเร็จ: ${err.message}`, "error");
    } finally {
      setSchedulerLoading(false);
    }
  };

  const handleChangeInterval = async (val: number) => {
    setIntervalMinutes(val);
    setSecondsRemaining(val * 60);

    if (autoScheduleActive) {
      try {
        const res = await fetch("/api/scheduler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: true,
            intervalMinutes: val,
          }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          setNextSyncAt(json.data.nextSyncAt);
          localStorage.setItem("manga_scheduler_config", JSON.stringify(json.data));
          window.dispatchEvent(new Event("manga-scheduler-updated"));
          addLog(`⚙️ ปรับความถี่การซิงค์อัตโนมัติเป็น: ทุก ${val} นาที`, "info");
        }
      } catch (err: any) {
        console.error("Failed to update interval", err);
      }
    }
  };

  // Add new manga URL to watchlist
  const handleAddUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputUrl.trim()) return;

    setAdding(true);
    addLog(`➕ กำลังตรวจสอบและเพิ่ม URL: ${inputUrl.trim()}...`, "info");

    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl.trim(), scanNow: true, maxNewChapters: 3 }),
      });
      
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        if (res.status === 504 || text.includes("TIMEOUT") || text.includes("An error occurred")) {
          throw new Error("เซิร์ฟเวอร์ใช้เวลาประมวลผลนานเกินกำหนด (Timeout) - มังงะมีจำนวนตอนมาก");
        }
        throw new Error("เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง");
      }

      if (data.success) {
        addLog(
          `✅ เพิ่มเข้าสู่รายการติดตามสำเร็จ: ${data.data?.title || inputUrl}`,
          "success"
        );
        if (data.syncResult) {
          addLog(
            `📦 ผลการซิงค์เริ่มต้น: ข้ามตอนเดิม ${data.syncResult.skippedExistingChapters} ตอน | ดาวน์โหลดตอนใหม่ ${data.syncResult.newChaptersDownloaded} ตอน`,
            "info"
          );
        }
        setInputUrl("");
        await fetchWatchlist();
      } else {
        addLog(`❌ เพิ่มไม่สำเร็จ: ${data.error}`, "error");
      }
    } catch (err: any) {
      addLog(`❌ การเชื่อมต่อล้มเหลว: ${err.message}`, "error");
    } finally {
      setAdding(false);
    }
  };

  // Sync single manga
  const handleSyncSingle = async (item: WatchedItem) => {
    setSyncingId(item.id);
    addLog(`⚡ เริ่มต้นซิงค์มังงะ: ${item.title}...`, "info");

    try {
      const res = await fetch("/api/cron/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("เซิร์ฟเวอร์ตอบกลับไม่ถูกต้องหรือหมดเวลาประมวลผล (Timeout)");
      }

      if (data.success && data.data) {
        const r = data.data;
        addLog(
          `✅ ซิงค์สำเร็จ [${r.title}]: ข้ามตอนเดิม ${r.skippedExistingChapters} ตอน | โหลดตอนใหม่ ${r.newChaptersDownloaded} ตอน (ตอนล่าสุดเว็บ: ${r.latestChapterOnWeb})`,
          "success"
        );
        await fetchWatchlist();
      } else {
        addLog(`❌ ซิงค์ไม่สำเร็จ [${item.title}]: ${data.error}`, "error");
      }
    } catch (err: any) {
      addLog(`❌ ซิงค์ล้มเหลว [${item.title}]: ${err.message}`, "error");
    } finally {
      setSyncingId(null);
    }
  };

  // Sync all watched mangas
  const handleSyncAll = async () => {
    if (syncingAll) return;
    setSyncingAll(true);
    addLog(`⚡ เริ่มต้นการซิงค์ทุกเรื่องในรายการติดตาม...`, "info");

    try {
      const res = await fetch("/api/cron/sync", { method: "POST" });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("เซิร์ฟเวอร์ตอบกลับไม่ถูกต้องหรือหมดเวลาประมวลผล (Timeout)");
      }

      if (data.success && Array.isArray(data.data)) {
        let totalDownloaded = 0;
        let totalSkipped = 0;

        for (const item of data.data) {
          if (item.success) {
            totalDownloaded += item.newChaptersDownloaded || 0;
            totalSkipped += item.skippedExistingChapters || 0;
            addLog(
              `✔️ [${item.title}]: ข้ามตอนเดิม ${item.skippedExistingChapters || 0} ตอน | เพิ่มตอนใหม่ ${item.newChaptersDownloaded || 0} ตอน`,
              item.newChaptersDownloaded > 0 ? "success" : "info"
            );
          } else {
            addLog(`⚠️ [${item.title}]: เกิดข้อผิดพลาด (${item.error})`, "warn");
          }
        }

        addLog(
          `🎉 การซิงค์ทั้งหมดเสร็จสมบูรณ์! ข้ามตอนเดิมรวม ${totalSkipped} ตอน | ดึงตอนใหม่สำเร็จรวม ${totalDownloaded} ตอน`,
          "success"
        );
        await fetchWatchlist();
      } else {
        addLog(`❌ การซิงค์ล้มเหลว: ${data.error}`, "error");
      }
    } catch (err: any) {
      addLog(`❌ การซิงค์ล้มเหลว: ${err.message}`, "error");
    } finally {
      setSyncingAll(false);
    }
  };

  // Toggle pause/active
  const handleToggleStatus = async (item: WatchedItem) => {
    const newStatus = item.status === "active" ? "paused" : "active";
    try {
      await fetch("/api/watchlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: newStatus }),
      });
      addLog(
        `เปลี่ยนสถานะ [${item.title}] เป็น ${newStatus === "active" ? "เปิดติดตาม" : "พักชั่วคราว"}`,
        "info"
      );
      await fetchWatchlist();
    } catch (err: any) {
      addLog(`ไม่สามารถเปลี่ยนสถานะได้: ${err.message}`, "error");
    }
  };

  // Delete from watchlist
  const handleDelete = async (item: WatchedItem) => {
    if (!confirm(`คุณต้องการลบ "${item.title}" ออกจากรายการติดตามหรือไม่? (ข้อมูลตอนที่เคยบันทึกไว้จะไม่หาย)`)) {
      return;
    }

    try {
      const res = await fetch(`/api/watchlist?id=${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        addLog(`🗑️ ลบ [${item.title}] ออกจากรายการติดตามแล้ว`, "warn");
        await fetchWatchlist();
      }
    } catch (err: any) {
      addLog(`ลบไม่สำเร็จ: ${err.message}`, "error");
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} นาที ${secs < 10 ? "0" : ""}${secs} วินาที`;
  };

  return (
    <div className="relative min-h-screen bg-[#0b0e14] text-zinc-100 flex flex-col">
      {/* Background Ambience */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center opacity-30 filter saturate-150 blur-[1px]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1920&auto=format&fit=crop&q=80')",
        }}
      />
      <div className="fixed inset-0 pointer-events-none z-0 bg-gradient-to-b from-[#0b0e14]/80 via-[#0b0e14]/60 to-[#0b0e14]/90" />
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed top-1/3 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Navbar */}
      <div className="relative z-20">
        <Navbar />
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="relative z-10 flex-1 py-6 px-3 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Back button & Breadcrumb */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-bold transition-all border border-zinc-700/70 shadow-md group"
            >
              <ArrowLeft className="w-4 h-4 text-[#46e39a] group-hover:-translate-x-0.5 transition-transform" />
              <span>ย้อนกลับหน้าแรก</span>
            </Link>

            <nav className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Link href="/" className="hover:text-white flex items-center gap-1 transition-colors">
                <Home className="w-3.5 h-3.5 text-zinc-400" />
                <span>หน้าแรก</span>
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              <span className="text-[#46e39a] font-bold">ระบบตั้งเวลาซิงค์</span>
            </nav>
          </div>

          {/* TOP HEADER */}
        <div className="bg-[#181a20] rounded-2xl border border-zinc-800 p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Multi-URL Smart Manga Sync & Scheduler</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                ระบบติดตาม & ดึงข้อมูลมังงะอัตโนมัติ
              </h1>
              <p className="text-zinc-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
                ตั้งเวลาให้ระบบตรวจสอบและดึงมังงะจากหลาย URL อัตโนมัติ โดยระบบจะ
                <span className="text-emerald-400 font-bold"> "ข้ามตอนที่มีอยู่แล้วในระบบ" </span>
                และ
                <span className="text-emerald-400 font-bold"> "ดาวน์โหลดเฉพาะตอนใหม่ที่ยังไม่มี" </span>
                จนถึงตอนล่าสุดโดยไม่เปลืองแบนด์วิดท์
              </p>
            </div>

            {/* Quick Master Sync Button */}
            <div className="shrink-0 flex items-center gap-3">
              <button
                onClick={handleSyncAll}
                disabled={syncingAll || watchlist.length === 0}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#46e39a] hover:bg-[#3bcd88] text-zinc-950 font-black text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <RefreshCw className={`w-4 h-4 ${syncingAll ? "animate-spin" : ""}`} />
                <span>{syncingAll ? "กำลังซิงค์ทุกเรื่อง..." : "⚡ ซิงค์ทุกเรื่องทันที"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* INPUT: ADD MANGA URL */}
        <div className="bg-[#181a20] rounded-2xl border border-zinc-800 p-6 shadow-xl">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> เพิ่ม URL มังงะที่ต้องการติดตาม
          </h2>

          <form onSubmit={handleAddUrl} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="วาง URL หน้ามังงะ เช่น https://www.go-manga.com/third-rate-martial-family/"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 rounded-xl bg-[#111317] border border-zinc-700 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="submit"
              disabled={adding || !inputUrl.trim()}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm shadow-md transition-all disabled:opacity-50"
            >
              <Plus className={`w-4 h-4 ${adding ? "animate-spin" : ""}`} />
              <span>{adding ? "กำลังเพิ่มและซิงค์..." : "เพิ่มเข้าติดตาม"}</span>
            </button>
          </form>

          {/* Quick preset chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="font-semibold text-zinc-500">ตัวอย่างทดสอบคลิกเดียว:</span>
            <button
              type="button"
              onClick={() => setInputUrl("https://www.go-manga.com/third-rate-martial-family/")}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Third-Rate Martial Family
            </button>
            <button
              type="button"
              onClick={() => setInputUrl("https://www.go-manga.com/regression-yong-clan-heir/")}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Regression Yong Clan Heir
            </button>
          </div>
        </div>

        {/* SCHEDULER CONTROLLER BAR */}
        <div className="bg-[#181a20] rounded-2xl border border-zinc-800 p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-xl transition-colors ${
                autoScheduleActive ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              <Clock
                className={`w-5 h-5 ${autoScheduleActive ? "animate-spin" : ""}`}
                style={{ animationDuration: "8s" }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">ระบบตั้งเวลาซิงค์อัตโนมัติ (Scheduler)</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                    autoScheduleActive
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {autoScheduleActive ? "🟢 กำลังทำงาน (Active) - สถานะเปิดค้างถาวร" : "⚪ ปิดอยู่"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {autoScheduleActive
                  ? `รอบถัดไปในอีก: ${formatTimeRemaining(secondsRemaining)} (จะเปิดค้างไว้ตลอดไปจนกว่าคุณจะกดปิดเอง)`
                  : "กดเริ่มทำงานเพื่อให้ระบบซิงค์ตอนใหม่อัตโนมัติตามช่วงเวลา"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Interval Selector */}
            <div className="flex items-center gap-2 bg-[#111317] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-300">
              <span className="text-zinc-500">ความถี่:</span>
              <select
                value={intervalMinutes}
                onChange={(e) => handleChangeInterval(parseInt(e.target.value, 10))}
                disabled={schedulerLoading}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                <option value={10} className="bg-zinc-900 text-white">ทุก 10 นาที</option>
                <option value={30} className="bg-zinc-900 text-white">ทุก 30 นาที</option>
                <option value={60} className="bg-zinc-900 text-white">ทุก 1 ชั่วโมง</option>
                <option value={180} className="bg-zinc-900 text-white">ทุก 3 ชั่วโมง</option>
                <option value={360} className="bg-zinc-900 text-white">ทุก 6 ชั่วโมง</option>
                <option value={720} className="bg-zinc-900 text-white">ทุก 12 ชั่วโมง</option>
                <option value={1440} className="bg-zinc-900 text-white">ทุก 24 ชั่วโมง</option>
              </select>
            </div>

            {/* Toggle Scheduler Button */}
            <button
              onClick={handleToggleScheduler}
              disabled={schedulerLoading}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all ${
                autoScheduleActive
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                  : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              } ${schedulerLoading ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {schedulerLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : autoScheduleActive ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>หยุดตั้งเวลา</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>เริ่มตั้งเวลาอัตโนมัติ</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* WATCHLIST MANGA ITEMS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <span>มังงะในรายการติดตาม ({watchlist.length} เรื่อง)</span>
            </h2>
            <button
              onClick={fetchWatchlist}
              className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> รีเฟรชรายการ
            </button>
          </div>

          {loading ? (
            <div className="bg-[#181a20] rounded-2xl border border-zinc-800 p-12 text-center text-zinc-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
              <p className="text-sm">กำลังโหลดข้อมูลรายการติดตาม...</p>
            </div>
          ) : watchlist.length === 0 ? (
            <div className="bg-[#181a20] rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-zinc-400">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
              <h3 className="text-base font-bold text-white mb-1">ยังไม่มีมังงะในรายการติดตาม</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
                วาง URL มังงะในกล่องด้านบนเพื่อเริ่มติดตามตอนใหม่และซิงค์รูปภาพเข้าสู่ระบบ
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {watchlist.map((item) => {
                const missingCount = Math.max(0, item.latestChapterOnWeb - item.totalChaptersInDb);
                const isSyncingThis = syncingId === item.id || syncingAll;

                return (
                  <div
                    key={item.id}
                    className="bg-[#181a20] rounded-2xl border border-zinc-800 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-zinc-700 transition-all shadow-lg"
                  >
                    {/* Left: Cover & Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="relative w-16 h-22 sm:w-20 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/60 shadow-md">
                        {item.cover ? (
                          <img
                            src={item.cover}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                            No Cover
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-sm text-[10px] font-bold px-1.5 py-0.5 rounded text-white">
                          Ch.{item.latestChapterOnWeb}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            onClick={() => handleToggleStatus(item)}
                            className={`cursor-pointer inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                              item.status === "active"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            }`}
                            title="คลิกเพื่อสลับ เปิด/พัก การติดตาม"
                          >
                            {item.status === "active" ? "🟢 ติดตามอยู่" : "⏸️ พักชั่วคราว"}
                          </span>

                          {missingCount > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ⚡ มีตอนใหม่รอซิงค์ {missingCount} ตอน
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> ตอนล่าสุดสมบูรณ์
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-white truncate">
                          {item.title}
                        </h3>

                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-zinc-400 hover:text-emerald-400 truncate flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{item.url}</span>
                        </a>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-1">
                          <div>
                            ในระบบ:{" "}
                            <span className="font-bold text-white">
                              {item.totalChaptersInDb}
                            </span>{" "}
                            ตอน
                          </div>
                          <span className="text-zinc-600">•</span>
                          <div>
                            บนเว็บ:{" "}
                            <span className="font-bold text-emerald-400">
                              {item.latestChapterOnWeb}
                            </span>{" "}
                            ตอน
                          </div>
                          <span className="text-zinc-600">•</span>
                          <div className="text-[11px] text-zinc-500">
                            ซิงค์ล่าสุด:{" "}
                            {item.lastSyncedAt
                              ? new Date(item.lastSyncedAt).toLocaleString("th-TH")
                              : "ยังไม่เคยซิงค์"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-zinc-800">
                      {/* Read Link */}
                      <Link
                        href={`/manga/${item.slug}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>อ่านมังงะ</span>
                      </Link>

                      {/* Sync This Manga */}
                      <button
                        onClick={() => handleSyncSingle(item)}
                        disabled={isSyncingThis}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingThis ? "animate-spin" : ""}`} />
                        <span>{isSyncingThis ? "กำลังซิงค์..." : "⚡ ซิงค์เรื่องนี้"}</span>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={isSyncingThis}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                        title="ลบออกจากรายการติดตาม"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* LIVE ACTIVITY CONSOLE */}
        <div className="bg-[#14161b] rounded-2xl border border-zinc-800 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Live Activity Log (บันทึกการทำงานสด)
              </span>
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ล้างประวัติ
            </button>
          </div>

          <div className="font-mono text-xs space-y-1.5 max-h-56 overflow-y-auto pr-2 scrollbar-thin">
            {logs.length === 0 ? (
              <div className="text-zinc-600 italic py-2">ไม่มีประวัติการทำงานในขณะนี้</div>
            ) : (
              logs.map((log) => {
                const colors = {
                  info: "text-zinc-400",
                  success: "text-emerald-400 font-semibold",
                  warn: "text-amber-400",
                  error: "text-rose-400 font-semibold",
                };
                return (
                  <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                    <span className="text-zinc-600 shrink-0 select-none">[{log.timestamp}]</span>
                    <span className={colors[log.type]}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* BACKGROUND 24/7 AUTOMATION GUIDE */}
        <div className="bg-[#181a20] rounded-2xl border border-zinc-800 p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>คำแนะนำ: การตั้งเวลาอัตโนมัติ 24 ชม. (Automation Guide)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-400 mt-3">
            <div className="p-4 rounded-xl bg-[#111317] border border-zinc-800 space-y-2">
              <span className="font-bold text-emerald-400">1. ตั้งเวลาผ่านหน้าเว็บ (In-Browser Scheduler)</span>
              <p>
                เปิดหน้านี้ทิ้งไว้ในเบราว์เซอร์แล้วกด <b>"เริ่มตั้งเวลาอัตโนมัติ"</b> ระบบจะนับถอยหลังและเรียกซิงค์ตอนใหม่อัตโนมัติตามช่วงเวลาที่คุณเลือก (10 นาที, 30 นาที, 1 ชม. ฯลฯ)
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#111317] border border-zinc-800 space-y-2">
              <span className="font-bold text-emerald-400">2. ตั้งเวลาผ่าน API / Cron Job / Windows Task Scheduler</span>
              <p>
                สามารถตั้งให้รันคำสั่งเบื้องหลังได้ตลอด 24 ชม. โดยเรียก Endpoint:
                <br />
                <code className="mt-1 inline-block bg-black/50 text-emerald-300 px-2 py-1 rounded">
                  curl http://localhost:3000/api/cron/sync
                </code>
              </p>
            </div>
          </div>
        </div>

      </div>
    </main>

    {/* Footer */}
    <div className="relative z-10 mt-10">
      <Footer />
    </div>
  </div>
);
}
