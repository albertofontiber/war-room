/**
 * /api/cron/calendar-tasks
 *
 * Lee eventos del calendario primario de los UPNs en `EMAIL_TASK_OWNER_UPNS`
 * (reutilizamos la misma env var — son los mismos buzones autorizados por la
 * Application Access Policy) vía Microsoft Graph y crea tareas en el CRM
 * cuando un attendee matchea con un `Contacto.email`.
 *
 * Dedup por `iCalUId` único (cross-user — si dos UPNs autorizados están en
 * la misma reunión, solo se crea una tarea).
 *
 * GitHub Actions cron — cada 30 min (ver `.github/workflows/calendar-tasks-cron.yml`).
 * Calendar invites se programan con días de antelación, no necesitamos
 * granularidad fina como con email (que va a 15 min).
 *
 * Privacy: eventos sin match no dejan rastro en BD. Mismo principio que
 * email-tasks. Permission `Calendars.Read` está limitado vía Application
 * Access Policy a los UPNs autorizados.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  ingestCalendarForUpn,
  type CalendarIngestStats,
} from "@/lib/calendar-task-matcher";
import { log } from "@/lib/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reusamos EMAIL_TASK_OWNER_UPNS — son los mismos buzones autorizados
  // por la Application Access Policy. Si en el futuro divergen, separamos
  // env vars (CALENDAR_TASK_OWNER_UPNS).
  const upnsRaw = process.env.EMAIL_TASK_OWNER_UPNS;
  if (!upnsRaw) {
    return NextResponse.json(
      { ok: false, reason: "EMAIL_TASK_OWNER_UPNS not configured" },
      { status: 200 }
    );
  }
  const upns = upnsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Override de ventana inicial (debug: ?windowDays=30 procesa el último mes).
  const windowDaysParam = req.nextUrl.searchParams.get("windowDays");
  const firstRunWindowMs = windowDaysParam
    ? Math.max(1, parseInt(windowDaysParam, 10)) * 24 * 60 * 60 * 1000
    : undefined;

  // Presupuesto de tiempo compartido entre los UPNs — el endpoint tiene
  // maxDuration=60. Si una ronda no termina dentro, el guard de
  // `ingestCalendarForUpn` corta y el cursor avanza hasta lo procesado; la
  // siguiente ronda reanuda. Sin esto, un backlog haría timeout (504).
  const deadline = Date.now() + 45_000;

  const results: CalendarIngestStats[] = [];
  for (const upn of upns) {
    try {
      const stats = await ingestCalendarForUpn(upn, {
        firstRunWindowMs,
        deadline,
      });
      results.push(stats);
    } catch (err) {
      log.error("cron/calendar-tasks:ingest", err, { upn });
      results.push({
        upn,
        fetched: 0,
        alreadyIngested: 0,
        matched: 0,
        noMatch: 0,
        cancelledSkipped: 0,
        internalOnlySkipped: 0,
        tareasCreated: 0,
        tareasUpdated: 0,
        errors: 1,
        budgetExceeded: false,
        newCursor: null,
      });
    }
  }

  const totalCreated = results.reduce((acc, r) => acc + r.tareasCreated, 0);
  const totalUpdated = results.reduce((acc, r) => acc + r.tareasUpdated, 0);
  const totalErrors = results.reduce((acc, r) => acc + r.errors, 0);
  log.info("cron/calendar-tasks", "ejecutado", {
    totalCreated,
    totalUpdated,
    totalErrors,
    results,
  });

  return NextResponse.json({
    ok: true,
    totalCreated,
    totalUpdated,
    totalErrors,
    results,
  });
}
