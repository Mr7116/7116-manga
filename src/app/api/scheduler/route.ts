import { NextResponse } from "next/server";
import { getSchedulerConfig, updateSchedulerConfig } from "@/lib/schedulerService";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/scheduler - Get current scheduler status and settings
export async function GET(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const config = await getSchedulerConfig();
    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to get scheduler config" },
      { status: 500 }
    );
  }
}

// POST /api/scheduler - Update scheduler status (enable/disable, change interval)
export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { enabled, intervalMinutes } = body;

    const updated = await updateSchedulerConfig({
      enabled: typeof enabled === "boolean" ? enabled : undefined,
      intervalMinutes: typeof intervalMinutes === "number" ? intervalMinutes : undefined,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: updated.enabled
        ? `เปิดใช้งานระบบตั้งเวลาอัตโนมัติแล้ว (ทุก ${updated.intervalMinutes} นาที)`
        : `ปิดระบบตั้งเวลาอัตโนมัติแล้ว`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update scheduler config" },
      { status: 500 }
    );
  }
}
