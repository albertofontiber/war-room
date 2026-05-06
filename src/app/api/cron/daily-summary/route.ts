/**
 * /api/cron/daily-summary
 * Vercel cron job — runs every weekday at 06:00 UTC (after BORME at 20:00 the previous evening).
 * Sends a daily digest email with BORME signals and perimeter updates.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendDailySummary } from "@/lib/email-daily-summary";
import { log } from "@/lib/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Fail-closed si CRON_SECRET no está configurado (antes quedaba público).
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const to = req.nextUrl.searchParams.get("to") ?? undefined;
    const force = req.nextUrl.searchParams.get("force") === "true";
    const result = await sendDailySummary({ force, to });
    log.info("cron/daily-summary", "ejecutado", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    log.error("cron/daily-summary", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
