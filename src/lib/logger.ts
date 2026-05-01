/**
 * Logger estructurado mínimo para endpoints y crons.
 *
 * Sustituye `console.log/warn/error` directos para que:
 *   - El log tenga un `scope` consistente (nombre del módulo o ruta).
 *   - El contexto (`ctx`) vaya como JSON, no concatenado al mensaje.
 *   - En el futuro podemos añadir filtros (PII, niveles por env, sinks
 *     externos como Vercel Analytics o Logtail) en un solo sitio.
 *
 * Uso:
 *   import { log } from "@/lib/logger";
 *
 *   log.info("api/empresas", "stage changed", { empresaId: 123, to: "execution" });
 *   log.warn("api/portal/proposals", "duplicate", { cif });
 *   log.error("cron/borme", err, { date: "20260501" });
 *
 * Por ahora delega a console.* — los logs van directamente a Vercel Logs.
 * Los 33 callers de `console.*` actuales NO se migran en este PR; el helper
 * queda disponible para que el siguiente código que se escriba lo use.
 */

type LogContext = Record<string, unknown>;

function format(level: string, scope: string, msg: string, ctx?: LogContext): string {
  const tag = `[${level.toUpperCase()}][${scope}]`;
  return ctx && Object.keys(ctx).length > 0
    ? `${tag} ${msg} ${JSON.stringify(ctx)}`
    : `${tag} ${msg}`;
}

export const log = {
  info(scope: string, msg: string, ctx?: LogContext): void {
    console.log(format("info", scope, msg, ctx));
  },

  warn(scope: string, msg: string, ctx?: LogContext): void {
    console.warn(format("warn", scope, msg, ctx));
  },

  error(scope: string, err: unknown, ctx?: LogContext): void {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(format("error", scope, msg, ctx));
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
  },
};
