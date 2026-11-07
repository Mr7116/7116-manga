"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, RefreshCw } from "lucide-react";

export default function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "เข้าสู่ระบบไม่สำเร็จ");
      }
      window.location.href = next;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm bg-[#181a20] border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white">เข้าสู่ระบบผู้ดูแล</h1>
          <p className="text-xs text-zinc-400">สำหรับหน้านำเข้ามังงะและรายการติดตาม</p>
        </div>
      </div>

      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="รหัสผ่าน (ADMIN_SECRET)"
        className="w-full bg-[#111317] border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
      />

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || !password}
        className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-bold text-sm rounded-xl py-2.5 transition-colors"
      >
        {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
        เข้าสู่ระบบ
      </button>

      <Link href="/" className="block text-center text-xs text-zinc-500 hover:text-zinc-300">
        กลับหน้าแรก
      </Link>
    </form>
  );
}
