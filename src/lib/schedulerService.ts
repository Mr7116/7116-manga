import { prisma } from "./prisma";

export interface SchedulerConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: false,
  intervalMinutes: 30,
  lastSyncedAt: null,
  nextSyncAt: null,
};

const SETTING_KEY = "scheduler_config";

export async function getSchedulerConfig(): Promise<SchedulerConfig> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (!setting || !setting.value) {
      return DEFAULT_CONFIG;
    }

    const parsed = JSON.parse(setting.value);
    return {
      enabled: Boolean(parsed.enabled),
      intervalMinutes: typeof parsed.intervalMinutes === "number" ? parsed.intervalMinutes : 30,
      lastSyncedAt: parsed.lastSyncedAt || null,
      nextSyncAt: parsed.nextSyncAt || null,
    };
  } catch (error) {
    console.error("Error fetching scheduler config:", error);
    return DEFAULT_CONFIG;
  }
}

export async function updateSchedulerConfig(updates: {
  enabled?: boolean;
  intervalMinutes?: number;
}): Promise<SchedulerConfig> {
  const current = await getSchedulerConfig();

  const newEnabled = updates.enabled !== undefined ? updates.enabled : current.enabled;
  const requested = updates.intervalMinutes !== undefined ? updates.intervalMinutes : current.intervalMinutes;
  // The external trigger fires every 2 minutes, so anything shorter can't be honoured
  const newInterval = Math.min(Math.max(Math.round(requested), 2), 24 * 60);

  let newNextSyncAt = current.nextSyncAt;

  if (newEnabled && !current.enabled) {
    // Just switched on: run on the very next tick
    newNextSyncAt = new Date().toISOString();
  } else if (newEnabled) {
    // Interval changed while running: next run = last run + new interval (may already be due)
    const base = current.lastSyncedAt ? new Date(current.lastSyncedAt).getTime() : Date.now();
    newNextSyncAt = new Date(base + newInterval * 60 * 1000).toISOString();
  } else {
    newNextSyncAt = null;
  }

  const updatedConfig: SchedulerConfig = {
    enabled: newEnabled,
    intervalMinutes: newInterval,
    lastSyncedAt: current.lastSyncedAt,
    nextSyncAt: newNextSyncAt,
  };

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: {
      key: SETTING_KEY,
      value: JSON.stringify(updatedConfig),
    },
    update: {
      value: JSON.stringify(updatedConfig),
    },
  });

  return updatedConfig;
}

/**
 * Should a scheduled tick run a sync now?
 * The external trigger (pg_cron / cron-job.org) fires every 2 minutes; the interval
 * chosen on /watchlist decides how many of those ticks actually do work.
 * A 45s grace window absorbs trigger jitter so "every 2 minutes" doesn't become every 4.
 */
export function isSyncDue(config: SchedulerConfig, now = Date.now()): boolean {
  if (!config.enabled) return false;
  if (!config.nextSyncAt) return true;
  return new Date(config.nextSyncAt).getTime() - 45_000 <= now;
}

/** Record a finished run. Next run is scheduled from when this run STARTED. */
export async function recordSchedulerRun(startedAt: Date = new Date()): Promise<SchedulerConfig> {
  const current = await getSchedulerConfig();
  const next = new Date(startedAt.getTime() + current.intervalMinutes * 60 * 1000);

  const updatedConfig: SchedulerConfig = {
    ...current,
    lastSyncedAt: startedAt.toISOString(),
    nextSyncAt: current.enabled ? next.toISOString() : null,
  };

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(updatedConfig) },
    update: { value: JSON.stringify(updatedConfig) },
  });

  return updatedConfig;
}
