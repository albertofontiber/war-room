/**
 * /api/cron/registros/debug
 *
 * Comprueba desde Vercel si las fuentes de los tres registros del sector
 * responden. No toca la base ni manda correo: solo pide y cuenta.
 *
 * Existe porque el cron es MENSUAL. Cuando una fuente falla, el aviso llega
 * con un "fetch failed" y la siguiente ocasión de comprobarlo es dentro de un
 * mes; además, estas webs se comportan distinto según desde dónde se pidan, y
 * lo que importa es lo que ve la función en `lhr1`, no lo que se ve desde un
 * portátil en España.
 *
 * Protegido por `CRON_SECRET`, igual que el endpoint principal.
 */

import { NextRequest, NextResponse } from "next/server";
import { enlaceListado } from "@/lib/cepreven/localiza-listado";
import { URL_ASOCIADOS } from "@/lib/cepreven/parse-asociados";
import { URL_EUSKADI } from "@/lib/policia/parse-euskadi";
import { AGENTE, motivo } from "@/lib/registros/red";
import { log } from "@/lib/logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 20_000;

const URL_CEPREVEN = "https://www.calificacioncepreven.com/Descarga-Documentos.html";
const URL_CATALUNYA = "https://analisi.transparenciacatalunya.cat/resource/7frg-7rdi.json?$limit=1";
/** El directorio de la Policía devuelve 403 a propósito. Sirve igual: lo que
 *  se mide es si se llega, no si hay listado. */
const URL_POLICIA = "https://www.policia.es/miscelanea/seguridad_privada/sector/";

type Sonda = {
  fuente: string;
  url: string;
  ok: boolean;
  status?: number;
  ms: number;
  /** Lo que se ha podido leer de la respuesta, cuando dice algo útil. */
  nota?: string;
  error?: string;
};

async function sonda(
  fuente: string,
  url: string,
  metodo: "GET" | "HEAD",
  lee?: (res: Response) => Promise<string>
): Promise<Sonda> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { "User-Agent": AGENTE },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const nota = res.ok && lee ? await lee(res) : undefined;
    return { fuente, url, ok: res.ok, status: res.status, ms: Date.now() - t0, nota };
  } catch (err) {
    return { fuente, url, ok: false, ms: Date.now() - t0, error: motivo(err) };
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sondas = await Promise.all([
    sonda("cepreven · página de descargas", URL_CEPREVEN, "GET", async (res) => {
      const enlace = enlaceListado(await res.text());
      return enlace ? `enlace al listado: ${enlace}` : "SIN enlace al listado de calificación";
    }),
    sonda("cepreven · asociados", URL_ASOCIADOS, "HEAD"),
    sonda("seguridad privada · catalunya", URL_CATALUNYA, "GET", async (res) => {
      const filas = (await res.json()) as unknown[];
      return `${Array.isArray(filas) ? filas.length : 0} filas de muestra`;
    }),
    sonda("seguridad privada · euskadi", URL_EUSKADI, "HEAD"),
    sonda("seguridad privada · policía", URL_POLICIA, "HEAD"),
  ]);

  // El PDF de Cepreven cambia de nombre en cada edición, así que solo se puede
  // sondear si la página de descargas ha dado el enlace.
  const enlace = sondas[0].nota?.startsWith("enlace al listado: ")
    ? sondas[0].nota.slice("enlace al listado: ".length)
    : null;
  if (enlace) sondas.push(await sonda("cepreven · PDF del listado", enlace, "HEAD"));

  const caidas = sondas.filter((s) => !s.ok && s.error).map((s) => s.fuente);
  if (caidas.length) log.warn("cron/registros/debug", `sin respuesta: ${caidas.join(", ")}`);

  return NextResponse.json({
    // La Policía contesta 403 al directorio: se llega, que es lo que se mide.
    ok: sondas.every((s) => s.ok || !s.error),
    region: process.env.VERCEL_REGION ?? null,
    sondas,
  });
}
