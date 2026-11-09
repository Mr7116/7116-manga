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
  createdAt?: string;
}

/** One card per manga: the first-added URL is the primary source, others are extra sources. */
interface WatchGroup {
  item: WatchedItem; // primary, with latestChapterOnWeb = max over all sources
  sources: WatchedItem[]; // all sources, primary first
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
  const [syncProgress, setSyncProgress] = useState<{ done: number; remaining: number } | null>(null);
  const stopSyncRef = useRef(false);
  const [addingSourceFor, setAddingSourceFor] = useState<string | null>(null);
  const [sourceInput, setSourceInput] = useState("");
  const [savingSource, setSavingSource] = useState(false);

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

  // Countdown display only. The actual sync runs on the server (pg_cron / cron-job.org
  // hits /api/cron/sync every 2 minutes), so closing this page does not stop it.
  useEffect(() => {
    if (!autoScheduleActive) {
      setSecondsRemaining(intervalMinutes * 60);
      return;
    }

    const timer = setInterval(() => {
      if (nextSyncAt) {
        const diffSec = Math.round((new Date(nextSyncAt).getTime() - Date.now()) / 1000);
        setSecondsRemaining(Math.max(0, diffSec));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [autoScheduleActive, intervalMinutes, nextSyncAt]);

  // While the page is open, refresh status from the server every 30s to show background results
  useEffect(() => {
    const poll = setInterval(() => {
      fetchWatchlist();
      fetchSchedulerConfig();
    }, 30_000);
    return () => clearInterval(poll);
  }, []);

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
  // Sync one manga repeatedly until every chapter on the source is downloaded.
  // Each request downloads a batch (~8 chapters); press the button again to stop.
  const handleSyncSingle = async (item: WatchedItem, sources: WatchedItem[] = [item]) => {
    if (syncingId === item.id) {
      stopSyncRef.current = true;
      addLog(`⏹ กำลังหยุดซิงค์ [${item.title}] หลังจบรอบนี้...`, "warn");
      return;
    }
    if (syncingId) return;

    stopSyncRef.current = false;
    setSyncingId(item.id);
    setSyncProgress(null);
    addLog(`⚡ เริ่มซิงค์ [${item.title}] ต่อเนื่องจนครบทุกตอน...`, "info");

    let totalNew = 0;
    let busyRetries = 0;
    let complete = false;
    try {
     for (const [srcIdx, source] of sources.entries()) {
      if (stopSyncRef.current || complete) break;
      if (sources.length > 1) {
        addLog(`🌐 [${item.title}] แหล่งที่ ${srcIdx + 1}/${sources.length}: ${source.url}`, "info");
      }
      for (let round = 1; round <= 200; round++) {
        if (stopSyncRef.current) {
          addLog(`⏹ หยุดซิงค์ [${item.title}] แล้ว (ดึงไป ${totalNew} ตอน) ที่เหลือระบบอัตโนมัติจะดึงต่อเอง`, "warn");
          break;
        }

        const res = await fetch("/api/cron/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: source.url }),
        });
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("เซิร์ฟเวอร์ตอบกลับไม่ถูกต้องหรือหมดเวลาประมวลผล (Timeout)");
        }

        // Background sync holds the lock: wait and try again
        if (data.type === "skipped") {
          if (++busyRetries > 12) throw new Error("ระบบหลังบ้านกำลังซิงค์อยู่นานเกินไป ลองใหม่ภายหลัง");
          await new Promise((r) => setTimeout(r, 5000));
          round--;
          continue;
        }
        busyRetries = 0;

        if (!data.success || !data.data) {
          throw new Error(data.error || "ซิงค์ไม่สำเร็จ");
        }

        const r = data.data;
        totalNew += r.newChaptersDownloaded || 0;
        const remaining = r.remainingMissingChapters ?? 0;
        setSyncProgress({ done: totalNew, remaining });
        addLog(
          `📥 [${r.title}] รอบที่ ${round}: โหลดใหม่ ${r.newChaptersDownloaded} ตอน | เหลือ ${remaining} ตอน`,
          r.newChaptersDownloaded > 0 ? "success" : "info"
        );
        fetchWatchlist();

        if (remaining <= 0) {
          complete = true;
          addLog(`✅ [${item.title}] ซิงค์ครบทุกตอนแล้ว (โหลดใหม่รวม ${totalNew} ตอน)`, "success");
          break;
        }
        if (r.newChaptersDownloaded === 0) {
          // Nothing more could be downloaded (source/mirror has no images for the rest)
          const failed = (r.failedChapterNumbers || []).map((n: number) => `ตอนที่ ${n}`).join(", ");
          addLog(
            `⚠️ [${r.title}] แหล่งนี้ยังขาด ${remaining} ตอนที่ดึงรูปไม่ได้${failed ? `: ${failed}` : ""}${
              srcIdx < sources.length - 1 ? " → ลองแหล่งถัดไป" : ""
            }`,
            "warn"
          );
          break;
        }
      }
     }
    } catch (err: any) {
      addLog(`❌ ซิงค์ล้มเหลว [${item.title}]: ${err.message}`, "error");
    } finally {
      setSyncingId(null);
      setSyncProgress(null);
      await fetchWatchlist();
    }
  };

  // Sync all watched mangas
  const handleSyncAll = async () => {
    if (syncingAll) return;
    setSyncingAll(true);
    addLog(`⚡ เริ่มต้นการซิงค์ทุกเรื่องในรายการติดตาม...`, "info");

    try {
      const res = await fetch("/api/cron/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("เซิร์ฟเวอร์ตอบกลับไม่ถูกต้องหรือหมดเวลาประมวลผล (Timeout)");
      }

      if (data.type === "skipped") {
        addLog(`⏳ ระบบหลังบ้านกำลังซิงค์อยู่แล้ว ผลลัพธ์จะแสดงเมื่อรอบนั้นเสร็จ`, "warn");
      } else if (data.success && Array.isArray(data.data)) {
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

  // Delete a manga (all of its sources) from the watchlist
  const handleDelete = async (item: WatchedItem, sources: WatchedItem[] = [item]) => {
    if (!confirm(`คุณต้องการลบ "${item.title}" ออกจากรายการติดตามหรือไม่? (ข้อมูลตอนที่เคยบันทึกไว้จะไม่หาย)`)) {
      return;
    }

    try {
      for (const src of sources) {
        await fetch(`/api/watchlist?id=${src.id}`, { method: "DELETE" });
      }
      addLog(`🗑️ ลบ [${item.title}] ออกจากรายการติดตามแล้ว`, "warn");
      await fetchWatchlist();
    } catch (err: any) {
      addLog(`ลบไม่สำเร็จ: ${err.message}`, "error");
    }
  };

  // Remove one extra source URL (chapters already downloaded stay)
  const handleRemoveSource = async (src: WatchedItem) => {
    if (!confirm(`ลบแหล่งข้อมูลนี้?\n${src.url}`)) return;
    try {
      await fetch(`/api/watchlist?id=${src.id}`, { method: "DELETE" });
      addLog(`🗑️ ลบแหล่งข้อมูล ${src.url}`, "warn");
      await fetchWatchlist();
    } catch (err: any) {
      addLog(`ลบแหล่งไม่สำเร็จ: ${err.message}`, "error");
    }
  };

  // Add another source URL for an existing manga
  const handleAddSource = async (item: WatchedItem) => {
    const url = sourceInput.trim();
    if (!url.startsWith("http")) {
      addLog("กรุณาใส่ URL หน้าเรื่องที่ขึ้นต้นด้วย http/https", "error");
      return;
    }
    setSavingSource(true);
    addLog(`➕ เพิ่มแหล่งข้อมูลให้ [${item.title}]: ${url}`, "info");
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, targetSlug: item.slug }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "เพิ่มแหล่งไม่สำเร็จ");
      const r = data.syncResult;
      addLog(
        `✅ ${data.message}${r ? ` — แหล่งนี้มี ${r.totalWebChapters} ตอน, โหลดใหม่ ${r.newChaptersDownloaded} ตอน` : ""}`,
        "success"
      );
      setSourceInput("");
      setAddingSourceFor(null);
      await fetchWatchlist();
    } catch (err: any) {
      addLog(`❌ ${err.message}`, "error");
    } finally {
      setSavingSource(false);
    }
  };

  // Group sources by manga slug; the first-added URL is the primary
  const groupedWatchlist: WatchGroup[] = (() => {
    const bySlug = new Map<string, WatchedItem[]>();
    for (const w of watchlist) {
      const key = w.slug && w.slug !== "pending-import" ? w.slug : `id:${w.id}`;
      bySlug.set(key, [...(bySlug.get(key) ?? []), w]);
    }
    return Array.from(bySlug.values()).map((list) => {
      const sources = [...list].sort(
        (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      );
      const item = {
        ...sources[0],
        latestChapterOnWeb: Math.max(...sources.map((x) => x.latestChapterOnWeb || 0)),
      };
      return { item, sources };
    });
  })();

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
              <span className="text-zinc-700 mx-1">|</span>
              <a href="/api/auth/logout" className="hover:text-rose-300 transition-colors">
                ออกจากระบบ
              </a>
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
                  ? secondsRemaining > 0
                    ? `รอบถัดไปในอีก: ${formatTimeRemaining(secondsRemaining)} (ทำงานบนเซิร์ฟเวอร์ ปิดหน้าเว็บได้)`
                    : "ถึงรอบแล้ว รอเซิร์ฟเวอร์เริ่มซิงค์ (ภายใน 2 นาที)"
                  : "กดเริ่มทำงานเพื่อให้เซิร์ฟเวอร์ซิงค์ตอนใหม่อัตโนมัติ แม้ปิดหน้าเว็บไปแล้ว"}
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
                <option value={2} className="bg-zinc-900 text-white">ทุก 2 นาที</option>
                <option value={5} className="bg-zinc-900 text-white">ทุก 5 นาที</option>
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
              <span>มังงะในรายการติดตาม ({groupedWatchlist.length} เรื่อง)</span>
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
              {groupedWatchlist.map(({ item, sources }) => {
                // Backlogs download oldest-first, so the highest downloaded chapter tracks progress.
                // (Counting rows gave false "1 missing" when the source skips a number.)
                const missingCount = Math.max(0, Math.ceil(item.latestChapterOnWeb - item.latestChapterInDb));
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
                              {item.totalChaptersInDb > 0 ? `ตอนที่ ${item.latestChapterInDb}` : "ยังไม่มีตอน"}
                            </span>{" "}
                            <span className="text-[11px] text-zinc-500">({item.totalChaptersInDb} ตอน)</span>
                          </div>
                          <span className="text-zinc-600">•</span>
                          <div>
                            บนเว็บ:{" "}
                            <span className="font-bold text-emerald-400">
                              ตอนที่ {item.latestChapterOnWeb}
                            </span>
                          </div>
                          <span className="text-zinc-600">•</span>
                          <div className="text-[11px] text-zinc-500">
                            ซิงค์ล่าสุด:{" "}
                            {item.lastSyncedAt
                              ? new Date(item.lastSyncedAt).toLocaleString("th-TH")
                              : "ยังไม่เคยซิงค์"}
                          </div>
                        </div>
                        {item.lastError && (
                          <div className="mt-1 text-[11px] text-amber-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span className="truncate">{item.lastError}</span>
                          </div>
                        )}

                        {/* Extra sources */}
                        {sources.length > 1 && (
                          <div className="mt-2 space-y-1">
                            {sources.slice(1).map((src, i) => (
                              <div key={src.id} className="flex items-center gap-2 text-[11px] text-zinc-400 min-w-0">
                                <span className="shrink-0 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-bold">
                                  แหล่ง {i + 2}
                                </span>
                                <a href={src.url} target="_blank" rel="noopener noreferrer" className="truncate hover:text-sky-300">
                                  {src.url}
                                </a>
                                <span className="shrink-0 text-zinc-500">ตอนที่ {src.latestChapterOnWeb}</span>
                                {src.lastError && (
                                  <span className="shrink-0 text-amber-400" title={src.lastError}>
                                    <AlertCircle className="w-3 h-3" />
                                  </span>
                                )}
                                <button
                                  onClick={() => handleRemoveSource(src)}
                                  disabled={isSyncingThis}
                                  className="shrink-0 text-zinc-500 hover:text-rose-400"
                                  title="ลบแหล่งนี้"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {addingSourceFor === item.id ? (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              autoFocus
                              value={sourceInput}
                              onChange={(e) => setSourceInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddSource(item);
                                if (e.key === "Escape") setAddingSourceFor(null);
                              }}
                              placeholder="URL หน้าเรื่องจากเว็บอื่น เช่น https://www.go-manga.com/..."
                              className="flex-1 min-w-0 bg-[#111317] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-sky-500"
                            />
                            <button
                              onClick={() => handleAddSource(item)}
                              disabled={savingSource || !sourceInput.trim()}
                              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[11px] font-bold disabled:opacity-50"
                            >
                              {savingSource ? "กำลังเพิ่ม..." : "เพิ่ม"}
                            </button>
                            <button
                              onClick={() => setAddingSourceFor(null)}
                              className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-300"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddingSourceFor(item.id);
                              setSourceInput("");
                            }}
                            className="mt-2 text-[11px] text-sky-400 hover:text-sky-300 font-semibold"
                          >
                            + เพิ่มแหล่งดึงข้อมูล
                          </button>
                        )}
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
                        onClick={() => handleSyncSingle(item, sources)}
                        disabled={syncingAll || (!!syncingId && syncingId !== item.id)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingThis ? "animate-spin" : ""}`} />
                        <span>
                          {syncingId === item.id
                            ? syncProgress
                              ? `ได้ ${syncProgress.done} / เหลือ ${syncProgress.remaining} (กดเพื่อหยุด)`
                              : "กำลังซิงค์... (กดเพื่อหยุด)"
                            : isSyncingThis
                              ? "กำลังซิงค์..."
                              : "⚡ ซิงค์จนครบ"}
                        </span>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(item, sources)}
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
                    {/* Server (UTC) and browser (Asia/Bangkok) render different times for the initial log line */}
                    <span className="text-zinc-600 shrink-0 select-none" suppressHydrationWarning>
                      [{log.timestamp}]
                    </span>
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
              <span className="font-bold text-emerald-400">1. ทำงานบนเซิร์ฟเวอร์ ไม่ต้องเปิดหน้าเว็บ</span>
              <p>
                Supabase pg_cron (หรือ cron-job.org) เรียก <code className="text-emerald-300">/api/cron/sync</code> ทุก 2 นาที
                เซิร์ฟเวอร์จะซิงค์เมื่อสวิตช์ด้านบนเปิดอยู่และถึงรอบตามความถี่ที่เลือก ปิดเบราว์เซอร์หรือปิดคอมได้เลย
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#111317] border border-zinc-800 space-y-2">
              <span className="font-bold text-emerald-400">2. เรียกเองผ่าน API (ต้องใช้ CRON_SECRET)</span>
              <p>
                <code className="mt-1 inline-block bg-black/50 text-emerald-300 px-2 py-1 rounded break-all">
                  curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://your-app/api/cron/sync
                </code>
                <br />
                ตั้งค่าครั้งแรกด้วย <code className="text-emerald-300">npm run cron:setup</code> (ดู README)
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
