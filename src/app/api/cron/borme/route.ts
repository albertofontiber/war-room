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
import { CRON_JOBS, runCron } from "@/lib/cron-runs";
import { log } from "@/lib/logger";

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

  log.info("cron/borme", "Processing date", { dateStr });

  // ── Process ───────────────────────────────────────────────────────────────
  try {
    const execution = await runCron({
      job: CRON_JOBS.borme,
      source: "vercel",
      run: () => processBormeDate(dateStr),
      status: (result) => (result.errors.length > 0 ? "WARNING" : "SUCCESS"),
      summary: (result) => ({
        date: dateStr,
        alertasCreadas: result.alertasCreadas,
        empresasEncontradas: result.empresasEncontradas,
        pdfsProcesados: result.pdfsProcesados,
        entradasExtraidas: result.entradasExtraidas,
        errors: result.errors.length,
      }),
    });
    const result = execution.value;
    log.info("cron/borme", "Done", {
      runId: execution.runId,
      status: execution.status,
      durationMs: execution.durationMs,
      alertasCreadas: result.alertasCreadas,
      empresasEncontradas: result.empresasEncontradas,
      pdfsProcesados: result.pdfsProcesados,
      entradasExtraidas: result.entradasExtraidas,
    });
    if (result.errors.length > 0) {
      log.warn("cron/borme", `Errors (${result.errors.length})`, { errors: result.errors });
    }
    return NextResponse.json({
      ok: true,
      ...result,
      execution: {
        id: execution.runId,
        status: execution.status,
        durationMs: execution.durationMs,
      },
    });
  } catch (err) {
    log.error("cron/borme", err, { dateStr });
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
