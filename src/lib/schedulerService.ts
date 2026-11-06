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
  const newInterval = updates.intervalMinutes !== undefined ? updates.intervalMinutes : current.intervalMinutes;

  let newNextSyncAt = current.nextSyncAt;

  if (newEnabled) {
    // If enabling or changing interval, compute next sync time
    const baseTime = current.lastSyncedAt ? Math.max(Date.now(), new Date(current.lastSyncedAt).getTime()) : Date.now();
    newNextSyncAt = new Date(baseTime + newInterval * 60 * 1000).toISOString();
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

export async function recordSchedulerRun(): Promise<SchedulerConfig> {
  const current = await getSchedulerConfig();
  const now = new Date();
  const next = new Date(now.getTime() + current.intervalMinutes * 60 * 1000);

  const updatedConfig: SchedulerConfig = {
    ...current,
    lastSyncedAt: now.toISOString(),
    nextSyncAt: current.enabled ? next.toISOString() : null,
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
