/**
 * Supabase pg_cron setup — runs the sync every 2 minutes from inside your database,
 * so nothing on your computer or in a browser needs to stay open.
 *
 *   npm run cron:setup              create / update the job
 *   npm run cron:setup -- --status  show the job + last HTTP responses
 *   npm run cron:setup -- --remove  delete the job
 *
 * Reads from .env: DIRECT_URL (or DATABASE_URL), APP_URL, CRON_SECRET
 */
import { PrismaClient } from "@prisma/client";

// Load .env if present (Node >= 20.12)
try {
  process.loadEnvFile();
} catch {}

const JOB_NAME = "manga-sync-every-2-min";
const SCHEDULE = "*/2 * * * *";

const args = process.argv.slice(2);
const mode = args.includes("--remove") ? "remove" : args.includes("--status") ? "status" : "setup";

const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("❌ DIRECT_URL / DATABASE_URL is missing in .env");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

function sqlLiteral(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function setup() {
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET || "";

  if (!/^https:\/\/[^\s/]+/.test(appUrl)) {
    throw new Error("APP_URL must be your public https URL, e.g. https://7116-manga.vercel.app");
  }
  if (!/^[A-Za-z0-9_\-]{24,}$/.test(secret)) {
    throw new Error("CRON_SECRET must be at least 24 chars of letters/digits/_/- (see README)");
  }

  console.log("• enabling extensions pg_cron + pg_net ...");
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_cron`);
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_net`);
  } catch (e) {
    throw new Error(
      `Could not enable extensions (${e.message}).\n` +
        "  Enable them in Supabase Dashboard → Database → Extensions (pg_cron, pg_net), then run this again."
    );
  }

  const command = `
    select net.http_post(
      url := ${sqlLiteral(`${appUrl}/api/cron/sync`)},
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', ${sqlLiteral(`Bearer ${secret}`)}
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );`;

  // cron.schedule with the same name updates the existing job
  await prisma.$queryRawUnsafe(
    `select cron.schedule(${sqlLiteral(JOB_NAME)}, ${sqlLiteral(SCHEDULE)}, ${sqlLiteral(command)})`
  );

  console.log(`✅ pg_cron job "${JOB_NAME}" → POST ${appUrl}/api/cron/sync every 2 minutes`);
  console.log("   Turn the scheduler ON and pick the interval on /watchlist.");
  console.log("   Check it in ~3 minutes with:  npm run cron:setup -- --status");
}

async function status() {
  const jobs = await prisma.$queryRawUnsafe(
    `select jobid, jobname, schedule, active from cron.job where jobname = ${sqlLiteral(JOB_NAME)}`
  );
  if (jobs.length === 0) {
    console.log("No job found. Run: npm run cron:setup");
    return;
  }
  console.table(jobs.map((j) => ({ ...j, jobid: Number(j.jobid) })));

  const runs = await prisma.$queryRawUnsafe(
    `select status, start_time, return_message from cron.job_run_details
       where jobid = ${Number(jobs[0].jobid)} order by start_time desc limit 5`
  );
  console.log("Last pg_cron runs:");
  console.table(runs);

  try {
    const http = await prisma.$queryRawUnsafe(
      `select status_code, left(content, 160) as content, created from net._http_response order by created desc limit 5`
    );
    console.log("Last HTTP responses from /api/cron/sync:");
    console.table(http);
  } catch {}
}

async function remove() {
  await prisma.$queryRawUnsafe(
    `select cron.unschedule(jobid) from cron.job where jobname = ${sqlLiteral(JOB_NAME)}`
  );
  console.log(`🗑️  removed job "${JOB_NAME}"`);
}

try {
  if (mode === "remove") await remove();
  else if (mode === "status") await status();
  else await setup();
} catch (e) {
  console.error("❌", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
