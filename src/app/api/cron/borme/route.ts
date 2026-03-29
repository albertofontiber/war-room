/**
 * /api/cron/borme
 * Vercel cron job — runs every weekday at 11:00 UTC.
 * Processes the previous working day's BORME section A and creates
 * BormeAlerta records for companies in our database.
 *
 * Secured with CRON_SECRET env variable (set in Vercel dashboard).
 */

import { NextRequest, NextResponse } from "next/server";
import { processBormeDate, lastWorkdays } from "@/lib/borme";

// Vercel allows up to 300s for cron jobs on Pro plan
export const maxDuration = 300;

// Prevent static optimization — this route must be dynamic
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Date selection ────────────────────────────────────────────────────────
  // Allow manual override via ?date=YYYYMMDD query param
  const qDate = req.nextUrl.searchParams.get("date");
  const dateStr = qDate ?? lastWorkdays(1)[0];

  console.log(`[BORME cron] Processing date: ${dateStr}`);

  // ── Process ───────────────────────────────────────────────────────────────
  try {
    const result = await processBormeDate(dateStr);
    console.log(
      `[BORME cron] Done: ${result.alertasCreadas} alertas, ` +
        `${result.empresasEncontradas} empresas en ${result.pdfsProcesados} PDFs ` +
        `(${result.entradasExtraidas} entradas)`
    );
    if (result.errors.length > 0) {
      console.warn(`[BORME cron] Errors (${result.errors.length}):`, result.errors);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[BORME cron] Fatal error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
