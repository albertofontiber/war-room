/**
 * /api/cron/email-tasks
 *
 * Lee SentItems (salientes) e Inbox (entrantes) de los UPNs en
 * `EMAIL_TASK_OWNER_UPNS` (alberto, gabriel) vía Microsoft Graph y crea tareas
 * en el CRM cuando el contraparte del email matchea con un `Contacto.email`.
 * Dedup por `internetMessageId` único.
 *
 * Vercel cron — cada 10 min (ver vercel.json).
 *
 * Privacy: emails sin match no dejan rastro en BD. Solo subject + email del
 * contacto + fecha para los que sí entran. Permission `Mail.Read` está
 * limitado a 2 buzones vía Application Access Policy de Exchange Online.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  CRON_JOBS,
  completeCronRun,
  failCronRun,
  startCronRun,
} from "@/lib/cron-runs";
import { ingestUpn, type IngestStats } from "@/lib/email-task-matcher";
import { log } from "@/lib/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tracker = await startCronRun({
    job: CRON_JOBS.emailTasks,
    source: "github-actions",
  });

  try {

  const upnsRaw = process.env.EMAIL_TASK_OWNER_UPNS;
  if (!upnsRaw) {
    const durationMs = await completeCronRun(tracker, "WARNING", { configured: false });
    return NextResponse.json(
      {
        ok: false,
        reason: "EMAIL_TASK_OWNER_UPNS not configured",
        execution: { id: tracker.runId, status: "WARNING", durationMs },
      },
      { status: 200 }
    );
  }
  const upns = upnsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // First-run override (en pruebas: ?windowMin=1440 procesa el último día).
  const windowMinParam = req.nextUrl.searchParams.get("windowMin");
  const firstRunWindowMs = windowMinParam
    ? Math.max(1, parseInt(windowMinParam, 10)) * 60 * 1000
    : undefined;

  const results: IngestStats[] = [];
  for (const upn of upns) {
    try {
      const stats = await ingestUpn(upn, { firstRunWindowMs });
      results.push(stats);
    } catch (err) {
      log.error("cron/email-tasks:ingestUpn", err, { upn });
      results.push({
        upn,
        sentFetched: 0,
        receivedFetched: 0,
        alreadyIngested: 0,
        matched: 0,
        noMatch: 0,
        internalSkipped: 0,
        tareasCreated: 0,
        errors: 1,
        newSentCursor: null,
        newReceivedCursor: null,
      });
    }
  }

  const totalCreated = results.reduce((acc, r) => acc + r.tareasCreated, 0);
  const totalErrors = results.reduce((acc, r) => acc + r.errors, 0);
  const status = totalErrors > 0 ? "WARNING" : "SUCCESS";
  const durationMs = await completeCronRun(tracker, status, {
    configured: true,
    accounts: results.length,
    tareasCreated: totalCreated,
    errors: totalErrors,
  });
  log.info("cron/email-tasks", "ejecutado", {
    totalCreated,
    totalErrors,
    accounts: results.length,
    runId: tracker.runId,
    status,
    durationMs,
  });

  return NextResponse.json({
    ok: true,
    totalCreated,
    totalErrors,
    results,
    execution: { id: tracker.runId, status, durationMs },
  });
  } catch (err) {
    await failCronRun(tracker, err);
    return NextResponse.json({ ok: false, error: "Cron execution failed" }, { status: 500 });
  }
}
