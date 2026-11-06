import Link from "next/link";
import { Flame, ShieldAlert, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-[#0e1015]/95 text-zinc-400 text-xs backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="logo-gomanga text-xl tracking-tight text-white">
                7116-MANGA
              </span>
            </div>
            <p className="max-w-md text-zinc-400 text-xs leading-relaxed">
              อ่านมังงะ แปลไทย มังฮวา เกาหลี มังงะจีน คมชัดทุกตอน โหลดเร็วทันใจ อัปเดตตอนใหม่ทุกวัน
            </p>
            <div className="flex items-center gap-2 text-zinc-500 text-[11px] pt-1">
              <ShieldAlert className="h-4 w-4 text-[#46e39a]" />
              <span>DMCA: เว็บไซต์นี้เป็นเพียงผู้รวบรวมข้อมูลเพื่อการทดสอบ ไม่ได้จัดเก็บไฟล์บนเซิร์ฟเวอร์โดยตรง</span>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-zinc-200 mb-2.5 text-xs uppercase tracking-wider">
              เมนูหลัก
            </h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link href="/" className="hover:text-[#46e39a] transition-colors">
                  อ่านมังงะ
                </Link>
              </li>
              <li>
                <Link href="/?type=MANHWA" className="hover:text-[#46e39a] transition-colors">
                  มังงะเกาหลี
                </Link>
              </li>
              <li>
                <Link href="/?type=MANHUA" className="hover:text-[#46e39a] transition-colors">
                  มังงะจีน
                </Link>
              </li>
              <li>
                <Link href="/import" className="hover:text-[#46e39a] transition-colors text-emerald-400">
                  ระบบดึงข้อมูลจาก URL
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-zinc-200 mb-2.5 text-xs uppercase tracking-wider">
              ประเภทยอดนิยม
            </h3>
            <div className="flex flex-wrap gap-1">
              {["MANHWA", "MANHUA", "MANGA", "พระเอกเทพ", "Action", "Fantasy"].map((genre) => (
                <span
                  key={genre}
                  className="rounded bg-[#1e2025] px-2 py-0.5 text-[10px] text-zinc-400 border border-zinc-700/60"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-800/80 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-zinc-500 text-[11px]">
          <p>© {new Date().getFullYear()} 7116-MANGA. All rights reserved.</p>
          <p className="flex items-center gap-1">
            อ่านมังงะอ่านการ์ตูนออนไลน์แปลไทย 2026
          </p>
        </div>
      </div>
    </footer>
  );
}
