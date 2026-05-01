/**
 * /api/cron/borme
 * Vercel cron job — runs every weekday at 20:00 UTC (22:00 CEST).
 * Processes TODAY's BORME section A (published during the day) and creates
 * BormeAlerta records for companies in our database.
 *
 * Secured with CRON_SECRET env variable (set in Vercel dashboard).
 */

import { NextRequest, NextResponse } from "next/server";
import { processBormeDate } from "@/lib/borme";

// Vercel allows up to 300s for cron jobs on Pro plan
export const maxDuration = 300;

// Prevent static optimization — this route must be dynamic
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // Si CRON_SECRET no está configurado, fail-closed: no se ejecuta el cron.
  // Antes el patrón `if (cronSecret && secret !== cronSecret)` dejaba el
  // endpoint público cuando la env var no estaba.
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Date selection ────────────────────────────────────────────────────────
  // Allow manual override via ?date=YYYYMMDD query param.
  // By default use today's date — the cron runs at 22:00 CEST when BORME is fully published.
  const qDate = req.nextUrl.searchParams.get("date");
  const dateStr = qDate ?? (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  })();

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
