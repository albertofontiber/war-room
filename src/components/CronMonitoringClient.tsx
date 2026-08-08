"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "RUNNING" | "SUCCESS" | "WARNING" | "FAILED";

type CronRun = {
  id: string;
  job: string;
  source: string;
  status: Status;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  summary: Record<string, string | number | boolean | null> | null;
  errorCode: string | null;
};

const JOB_LABELS: Record<string, string> = {
  borme: "BORME",
  "daily-summary": "Resumen diario",
  "task-digest": "Digest de tareas",
  "target-docs-check": "Documentación de targets",
  "email-tasks": "Correo → tareas",
  "calendar-tasks": "Calendario → tareas",
  registros: "Registros del sector",
};

const STATUS_LABELS: Record<Status, string> = {
  RUNNING: "En curso",
  SUCCESS: "Correcto",
  WARNING: "Revisar",
  FAILED: "Fallido",
};

const STATUS_CLASSES: Record<Status, string> = {
  RUNNING: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  SUCCESS: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  WARNING: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  FAILED: "border-red-400/30 bg-red-400/10 text-red-300",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms} ms`;
  return `${(ms / 1_000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function summaryText(summary: CronRun["summary"]): string {
  if (!summary) return "Sin métricas";
  const parts = Object.entries(summary).map(([key, value]) => `${key}: ${String(value)}`);
  return parts.join(" · ");
}

export default function CronMonitoringClient() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cron-runs?limit=50", { cache: "no-store" });
      const data = (await res.json()) as { runs?: CronRun[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el historial");
      setRuns(data.runs ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const stats = useMemo(() => {
    const initial: Record<Status, number> = { RUNNING: 0, SUCCESS: 0, WARNING: 0, FAILED: 0 };
    for (const run of runs) initial[run.status] += 1;
    return initial;
  }, [runs]);

  return (
    <main className="min-h-screen bg-wr-bg text-wr-text px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-wr-blue">War Room</p>
            <h1 className="mt-1 text-2xl font-semibold">Operación</h1>
            <p className="mt-1 text-sm text-wr-muted">
              Historial de automatizaciones. Se actualiza cada 30 segundos.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="tap-target-h rounded-md border border-wr-border px-3 py-2 text-sm text-wr-muted transition-colors hover:border-wr-muted hover:text-wr-text"
          >
            Actualizar
          </button>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["SUCCESS", "WARNING", "FAILED", "RUNNING"] as Status[]).map((status) => (
            <div key={status} className="rounded-lg border border-wr-border bg-wr-surface p-4">
              <p className="text-2xl font-semibold">{stats[status]}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-wr-hint">{STATUS_LABELS[status]}</p>
            </div>
          ))}
        </section>

        {error && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {error}. Si el despliegue es reciente, aplica primero la migración de base de datos.
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-wr-border bg-wr-surface">
          <div className="border-b border-wr-border px-4 py-3">
            <h2 className="font-medium">Últimas ejecuciones</h2>
          </div>
          <div className="divide-y divide-wr-border sm:hidden">
            {!loading && runs.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-wr-muted">Aún no hay ejecuciones registradas.</p>
            )}
            {runs.map((run) => (
              <article key={run.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-wr-text">{JOB_LABELS[run.job] ?? run.job}</p>
                    <p className="mt-0.5 text-xs text-wr-hint">{run.source}</p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[run.status]}`}>
                    {STATUS_LABELS[run.status]}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-wr-muted">
                  <span>{formatDate(run.startedAt)}</span>
                  <span className="shrink-0">{formatDuration(run.durationMs)}</span>
                </div>
                <p className="break-words text-xs leading-relaxed text-wr-muted">
                  {run.status === "FAILED" ? "Error técnico: consulta Vercel Logs" : summaryText(run.summary)}
                </p>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-wr-surface2 text-xs uppercase tracking-wider text-wr-hint">
                <tr>
                  <th className="px-4 py-3 font-medium">Proceso</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Inicio</th>
                  <th className="px-4 py-3 font-medium">Duración</th>
                  <th className="px-4 py-3 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wr-border">
                {!loading && runs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-wr-muted">Aún no hay ejecuciones registradas.</td></tr>
                )}
                {runs.map((run) => (
                  <tr key={run.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-wr-text">{JOB_LABELS[run.job] ?? run.job}</p>
                      <p className="mt-0.5 text-xs text-wr-hint">{run.source}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[run.status]}`}>
                        {STATUS_LABELS[run.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-wr-muted">{formatDate(run.startedAt)}</td>
                    <td className="px-4 py-3 text-wr-muted">{formatDuration(run.durationMs)}</td>
                    <td className="max-w-md px-4 py-3 text-xs text-wr-muted">
                      {run.status === "FAILED" ? "Error técnico: consulta Vercel Logs" : summaryText(run.summary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
