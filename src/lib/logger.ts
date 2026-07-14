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
type LogLevel = "info" | "warn" | "error";

/**
 * Un objeto JSON por línea permite filtrar en Vercel por `scope`, `level` o
 * campos concretos sin tener que parsear mensajes concatenados. El contexto
 * se anida para que nunca pueda sobrescribir los campos de control.
 */
function format(level: LogLevel, scope: string, message: string, ctx?: LogContext): string {
  return JSON.stringify({
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    ...(ctx && Object.keys(ctx).length > 0 ? { context: ctx } : {}),
  });
}

export const log = {
  info(scope: string, msg: string, ctx?: LogContext): void {
    console.log(format("info", scope, msg, ctx));
  },

  warn(scope: string, msg: string, ctx?: LogContext): void {
    console.warn(format("warn", scope, msg, ctx));
  },

  error(scope: string, err: unknown, ctx?: LogContext): void {
    const message = err instanceof Error ? err.message : String(err);
    const errorContext = err instanceof Error
      ? { ...ctx, errorName: err.name, stack: err.stack }
      : ctx;
    console.error(format("error", scope, message, errorContext));
  },
};
