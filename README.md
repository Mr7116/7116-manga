# 7116-MANGA

เว็บอ่านมังงะ/มันฮวาแปลไทย สร้างด้วย Next.js 16 + Prisma + Supabase (PostgreSQL) deploy บน Vercel
ดึงข้อมูลเรื่อง/ตอน/รูปจากเว็บต้นทาง (ธีม MangaReader เช่น Go-Manga และธีม Madara) และซิงค์ตอนใหม่อัตโนมัติฝั่งเซิร์ฟเวอร์

## โครงสร้าง

| ส่วน | ไฟล์ |
|---|---|
| ตัวดึงข้อมูล (ใช้ร่วมกันทุกที่) | `src/lib/scraper.ts` |
| เครื่องซิงค์ตอนใหม่ + run lock | `src/lib/syncService.ts` |
| ตั้งค่ารอบเวลา (เก็บใน DB) | `src/lib/schedulerService.ts` |
| ระบบล็อกอินผู้ดูแล | `src/lib/auth.ts`, `src/proxy.ts`, `/login` |
| ป้องกัน SSRF | `src/lib/safeFetch.ts` |
| endpoint ซิงค์ | `/api/cron/sync` |

หน้า public: `/`, `/manga/...`, `GET /api/manga`
หน้า/API ผู้ดูแล (ต้องล็อกอิน): `/import`, `/watchlist`, `/api/scrape`, `/api/manga/save`, `/api/watchlist`, `/api/scheduler`, `/api/cron/sync`, `/api/proxy`

## ตั้งค่า

1. คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่า
2. สร้าง secret สองตัว (ใช้ค่าต่างกัน):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   - `ADMIN_SECRET` คือรหัสผ่านสำหรับหน้า `/login`
   - `CRON_SECRET` คือ token สำหรับตัวเรียกซิงค์อัตโนมัติ
3. ใส่ `ADMIN_SECRET`, `CRON_SECRET` (และ `DATABASE_URL`, `DIRECT_URL`) ใน **Vercel → Project → Settings → Environment Variables** แล้ว redeploy
4. อัปเดต schema (ค่า default ใหม่) : `npx prisma db push`

```bash
npm install
npm run dev
```

## ซิงค์อัตโนมัติทุก 2 นาที (ไม่ต้องเปิดเว็บค้าง)

Vercel แผน Hobby ตั้ง cron ได้แค่วันละครั้ง จึงให้ **Supabase pg_cron** เป็นตัวเรียก `/api/cron/sync` ทุก 1 นาทีจากฝั่งฐานข้อมูลแทน
(pg_net มีปัญหา HTTP/2 กับ Vercel ทำให้คำขอพังสลับรอบ การเรียกทุกนาทีจึงรับประกันว่าได้ซิงค์อย่างน้อยทุก 2 นาที รอบที่ยังไม่ถึงเวลาจะตอบกลับทันทีโดยไม่ทำงาน)

```bash
# ใน .env ต้องมี DIRECT_URL, CRON_SECRET และ APP_URL=https://<your-app>.vercel.app
npm run cron:setup              # สร้าง/อัปเดต job
npm run cron:setup -- --status  # ดูผลการรันล่าสุด
npm run cron:setup -- --remove  # ลบ job
```

จากนั้นไปที่ `/watchlist` เปิดสวิตช์ Scheduler และเลือกความถี่ (ขั้นต่ำ 2 นาที)
ทุกครั้งที่ pg_cron เรียก เซิร์ฟเวอร์จะเช็กว่า "เปิดอยู่และถึงรอบหรือยัง" ถ้ายังจะข้ามทันที

ทางเลือกอื่น ถ้าไม่ใช้ pg_cron:
- **cron-job.org** (ฟรี): สร้าง job ให้ `POST https://<your-app>/api/cron/sync` ทุก 2 นาที และใส่ header `Authorization: Bearer <CRON_SECRET>`
- **รันบนเครื่องตัวเอง**: `npm run sync:daemon` (เครื่องต้องเปิดอยู่)

แต่ละรอบจะตรวจ `SYNC_BATCH_SIZE` เรื่อง (ค่าเริ่มต้น 3) โดยเลือกเรื่องที่ซิงค์ไว้นานที่สุดก่อน และโหลดตอนใหม่ไม่เกิน `SYNC_MAX_NEW_CHAPTERS` ตอนต่อเรื่อง (ค่าเริ่มต้น 3) ภายใน 40 วินาที
มี lock ใน DB กันไม่ให้สองรอบทำงานซ้อนกัน

## งานดูแลข้อมูลเก่า (ทำครั้งเดียว ไม่บังคับ)

ล้างคะแนน/ยอดวิวปลอมของเรื่องที่นำเข้าก่อนหน้านี้ (รันใน Supabase SQL Editor):

```sql
update "Manga" set rating = 0, "ratingCount" = 0, views = '0'
where (rating = 8.5 and "ratingCount" = 150 and views = '1.2K')
   or (rating = 8.0 and "ratingCount" = 100 and views = '1.0K');
```

ถ้า `prisma/backup-data.json` เคยถูก commit ให้เอาออกจาก git (ไฟล์บนเครื่องยังอยู่):

```bash
git rm --cached prisma/backup-data.json
```
