/**
 * /api/cron/daily-summary
 * Vercel cron job — runs every weekday at 12:00 UTC (after BORME at 11:00 and Pipedrive at 10:00).
 * Sends a daily digest email with BORME signals, Pipedrive changes, and perimeter updates.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendDailySummary } from "@/lib/email-daily-summary";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendDailySummary();
    console.log("[daily-summary]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[daily-summary] Fatal error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
