/**
 * Utilidades de red compartidas por los tres registros del sector.
 *
 * Todas las fuentes son webs de administraciones públicas: van y vienen, se
 * caen un rato y responden despacio. Dos cosas que no traía `fetch` a pelo y
 * que aquí hacen falta:
 *
 *   - Un reintento. Un corte de un segundo no debería costar un mes de datos,
 *     que es lo que pasa cuando el cron es mensual.
 *   - Saber POR QUÉ falló. undici deja el `message` en un "fetch failed" que
 *     no dice nada y esconde el motivo real en `cause`.
 */

export const AGENTE = "war-room/1.0 (+contacto@fontiber.com)";

/** Timeout por petición. Generoso: estos servidores tardan lo suyo. */
const TIMEOUT_MS = 60_000;

const INTENTOS = 3;
const ESPERA_MS = 1_500;

/**
 * Motivo legible de un error de red.
 *
 * `fetch failed` a secas es el mensaje que devuelve undici para cualquier
 * fallo de conexión —DNS, TLS, reset, timeout— y no permite distinguirlos. El
 * código concreto (`ECONNRESET`, `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`…)
 * viaja en `cause`, así que se sube al mensaje.
 */
export function motivo(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const causa = err.cause as { code?: string; message?: string } | undefined;
  const detalle = causa?.code ?? causa?.message;
  if (!detalle || err.message.includes(detalle)) return err.message;
  return `${err.message} (${detalle})`;
}

/**
 * `fetch` con timeout y reintentos.
 *
 * Reintenta ante fallo de red y ante 5xx/429 —lo que suele ser el servidor
 * saturado un momento—, pero no ante un 404 o un 403: eso no cambia por
 * insistir, y además insistir contra una web pública es de mala educación.
 *
 * No se usa en el sondeo de ediciones de la Policía: son cientos de peticiones
 * por pasada y reintentarlas todas triplicaría la carga sobre su servidor.
 */
export async function fetchConReintento(
  url: string,
  init: RequestInit = {},
  intentos = INTENTOS
): Promise<Response> {
  let ultimo: unknown;

  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": AGENTE, ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status < 500 && res.status !== 429) return res;
      ultimo = new Error(`HTTP ${res.status}`);
    } catch (err) {
      ultimo = err;
    }

    if (intento < intentos) await espera(ESPERA_MS * intento);
  }

  throw new Error(`${url} no respondió tras ${intentos} intentos: ${motivo(ultimo)}`);
}

function espera(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
