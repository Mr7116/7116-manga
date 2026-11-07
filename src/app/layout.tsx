import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueueProvider } from "@/context/QueueContext";
import FloatingQueueWidget from "@/components/FloatingQueueWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "7116-MANGA | อ่านมังงะ มังฮวา แปลไทย ออนไลน์ฟรี",
  description: "เว็บอ่านมังงะ มันฮวา แปลไทย คมชัด โหลดเร็ว อัปเดตรวดเร็วทุกวัน รองรับทั้งคอมพิวเตอร์และมือถือ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-rose-500 selection:text-white">
        <QueueProvider>
          {children}
          <FloatingQueueWidget />
        </QueueProvider>
      </body>
    </html>
  );
}
