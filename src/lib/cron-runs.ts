/**
 * Trazabilidad común para los procesos programados.
 *
 * Una caída del registro operativo nunca debe impedir que el cron haga su
 * trabajo. Por eso todas las operaciones contra `CronRun` son best-effort:
 * el detalle técnico queda en Vercel Logs y la aplicación sigue procesando
 * aunque la tabla aún no se haya desplegado o la BD esté momentáneamente
 * inaccesible.
 */

import { CronRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";

export const CRON_JOBS = {
  borme: "borme",
  dailySummary: "daily-summary",
  taskDigest: "task-digest",
  targetDocsCheck: "target-docs-check",
  emailTasks: "email-tasks",
  calendarTasks: "calendar-tasks",
  // Los tres registros del sector (Cepreven, seguridad privada y RIPCI) van
  // en un solo job para que las novedades lleguen en un único aviso.
  registros: "registros",
} as const;

export type CronJob = (typeof CRON_JOBS)[keyof typeof CRON_JOBS];
export type CronRunSource = "vercel" | "github-actions" | "manual";
export type CronRunSummary = Record<string, string | number | boolean | null>;

type RunCronInput<T> = {
  job: CronJob;
  source: CronRunSource;
  run: () => Promise<T>;
  /**
   * Solo contadores y etiquetas operativas; nunca emails, tokens, nombres de
   * empresas, cuerpos de mensajes ni errores crudos de proveedores.
   */
  summary?: (value: T) => CronRunSummary;
  status?: (value: T) => "SUCCESS" | "WARNING";
};

export type CronRunResult<T> = {
  value: T;
  runId: string | null;
  status: "SUCCESS" | "WARNING";
  durationMs: number;
};

export type CronRunTracker = {
  job: CronJob;
  source: CronRunSource;
  runId: string | null;
  startedMs: number;
};

function errorCodeOf(err: unknown): string {
  if (err instanceof Error && err.name) return err.name.slice(0, 120);
  return "UnknownError";
}

async function safeRecord(
  operation: "start" | "complete" | "fail",
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.error("cron-runs", err, { operation });
  }
}

async function notifyCronFailure(job: CronJob, runId: string | null): Promise<void> {
  try {
    await notifyAdmins({
      tipo: "cron_failed",
      titulo: `⚠️ Fallo en automatización: ${job}`,
      mensaje:
        "La ejecución no se completó. Revisa el panel de Operación y los logs de Vercel para el detalle técnico.",
      link: "/monitoring",
      email: true,
    });
  } catch (err) {
    // Si incluso la notificación falla, Vercel Logs conserva el error. El
    // cron original debe seguir devolviendo su fallo real al scheduler.
    log.error("cron-runs", err, { operation: "notify-failure", job, runId });
  }
}

/** Abre una ejecución sin bloquear el cron si el registro falla. */
export async function startCronRun(input: {
  job: CronJob;
  source: CronRunSource;
}): Promise<CronRunTracker> {
  const startedMs = Date.now();
  let runId: string | null = null;

  await safeRecord("start", async () => {
    const record = await prisma.cronRun.create({
      data: {
        job: input.job,
        source: input.source,
        status: CronRunStatus.RUNNING,
        startedAt: new Date(),
      },
      select: { id: true },
    });
    runId = record.id;
  });

  log.info("cron-runs", "started", { job: input.job, source: input.source, runId });
  return { job: input.job, source: input.source, runId, startedMs };
}

/** Cierra correctamente una ejecución ya iniciada. */
export async function completeCronRun(
  tracker: CronRunTracker,
  status: "SUCCESS" | "WARNING",
  summary?: CronRunSummary
): Promise<number> {
  const durationMs = Date.now() - tracker.startedMs;
  if (tracker.runId) {
    await safeRecord("complete", () =>
      prisma.cronRun
        .update({
          where: { id: tracker.runId! },
          data: {
            status: status === "SUCCESS" ? CronRunStatus.SUCCESS : CronRunStatus.WARNING,
            completedAt: new Date(),
            durationMs,
            summary,
          },
        })
        .then(() => undefined)
    );
  }
  log.info("cron-runs", "completed", {
    job: tracker.job,
    runId: tracker.runId,
    status,
    durationMs,
    summary,
  });
  return durationMs;
}

/** Marca una ejecución como fallida y notifica al equipo. */
export async function failCronRun(tracker: CronRunTracker, err: unknown): Promise<number> {
  const durationMs = Date.now() - tracker.startedMs;
  const errorCode = errorCodeOf(err);
  if (tracker.runId) {
    await safeRecord("fail", () =>
      prisma.cronRun
        .update({
          where: { id: tracker.runId! },
          data: {
            status: CronRunStatus.FAILED,
            completedAt: new Date(),
            durationMs,
            errorCode,
          },
        })
        .then(() => undefined)
    );
  }
  log.error("cron-runs", err, {
    job: tracker.job,
    runId: tracker.runId,
    durationMs,
    errorCode,
  });
  await notifyCronFailure(tracker.job, tracker.runId);
  return durationMs;
}

/** Ejecuta un cron con historial persistente, métricas y alerta de fallo. */
export async function runCron<T>(input: RunCronInput<T>): Promise<CronRunResult<T>> {
  const tracker = await startCronRun({ job: input.job, source: input.source });

  try {
    const value = await input.run();
    const status = input.status?.(value) ?? "SUCCESS";
    const summary = input.summary?.(value);
    const durationMs = await completeCronRun(tracker, status, summary);
    return { value, runId: tracker.runId, status, durationMs };
  } catch (err) {
    await failCronRun(tracker, err);
    throw err;
  }
}
