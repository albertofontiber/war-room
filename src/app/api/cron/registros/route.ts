/**
 * /api/cron/registros
 * Vercel cron job — día 1 de cada mes, 08:00 UTC.
 *
 * Refresca de una vez los tres registros del sector: Cepreven, seguridad
 * privada (Policía + Cataluña + Euskadi) y RIPCI.
 *
 * Van juntos y no en tres crons por dos motivos. Uno, responden a la misma
 * pregunta desde tres ángulos —quién está habilitado para qué— y ninguno se
 * mueve más de unas pocas veces al año, así que no hay razón para cadencias
 * distintas. Y dos, así las novedades llegan en UN aviso y un correo, en vez
 * de tres la misma mañana.
 *
 * Si uno falla, los otros dos siguen: el fallo se reporta en el mismo aviso.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  CRON_JOBS,
  completeCronRun,
  failCronRun,
  startCronRun,
} from "@/lib/cron-runs";
import { notifyAdmins } from "@/lib/notifications";
import { log } from "@/lib/logger";
import {
  sincronizaCepreven,
  sincronizaRipci,
  sincronizaSeguridadPrivada,
} from "@/lib/registros/sincroniza";
import { componeAviso } from "@/lib/registros/aviso";
import { motivo } from "@/lib/registros/red";
import type { ResultadoRegistro } from "@/lib/registros/tipos";

/**
 * 300 s es el techo del plan Hobby: subirlo más lo rechaza el despliegue
 * ("invalid_max_duration"), y para pasar de ahí hace falta Pro.
 *
 * El margen se ha ganado quitando trabajo, no pidiendo más tiempo: el grueso
 * se lo llevaba localizar la edición del listado nacional —hasta 45 días de
 * nombres candidatos, que ahora se sondean en paralelo y bajan de unos cuatro
 * minutos a menos de uno—. Lo que queda por encima son, los meses que hay
 * edición nueva, sus 17 MB de PDF, y las consultas del RIPCI, que su buscador
 * sirve a 5-7 s cada una. Si el cron se corta a la mitad no hay reintento
 * hasta el mes que viene, así que conviene no acercarse al techo.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const FUENTES = [
  { nombre: "Cepreven", sincroniza: sincronizaCepreven },
  { nombre: "Seguridad privada", sincroniza: sincronizaSeguridadPrivada },
  { nombre: "RIPCI", sincroniza: sincronizaRipci },
];

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tracker = await startCronRun({ job: CRON_JOBS.registros, source: "vercel" });

  try {
    const resultados: ResultadoRegistro[] = [];
    const fallos: string[] = [];

    // En serie y con el fallo acotado: que Cepreven se caiga no debe impedir
    // que se refresquen los otros dos.
    for (const fuente of FUENTES) {
      try {
        resultados.push(await fuente.sincroniza());
      } catch (err) {
        fallos.push(`${fuente.nombre}: ${motivo(err)}`);
        log.error("cron/registros", err, { fuente: fuente.nombre });
      }
    }

    const altas = resultados.flatMap((r) => r.altas.map((a) => ({ ...a, registro: r.registro })));
    const avisos = resultados.flatMap((r) => r.avisos);
    const ilegibles = resultados.filter((r) => r.ilegible);
    // Un registro puede haber ido a medias: seguridad privada son tres
    // fuentes y sigue adelante con las que respondan.
    const aMedias = resultados.reduce((n, r) => n + (r.fuentesConProblema ?? 0), 0);

    // Un solo aviso con todo lo del mes. Sin altas ni incidencias no se
    // molesta: las actualizaciones de rutina no son noticia.
    const aviso = componeAviso(resultados, fallos);
    if (aviso) {
      await notifyAdmins({
        tipo: "registros_cron",
        titulo: aviso.titulo,
        // La campanita se queda con el texto; el correo, con las tablas.
        mensaje: aviso.mensaje,
        html: aviso.html,
        link: "/",
        email: true,
      });
    }

    const status = ilegibles.length || fallos.length || aMedias ? "WARNING" : "SUCCESS";
    const durationMs = await completeCronRun(tracker, status, {
      altas: altas.length,
      actualizadas: resultados.reduce((n, r) => n + r.actualizadas, 0),
      avisos: avisos.length,
      fuentesIlegibles: ilegibles.length,
      fuentesFallidas: fallos.length,
      fuentesAMedias: aMedias,
      ...Object.fromEntries(
        resultados.flatMap((r) =>
          Object.entries(r.resumen).map(([k, v]) => [`${r.registro.toLowerCase().replace(/\s+/g, "_")}_${k}`, v])
        )
      ),
    });

    return NextResponse.json({
      ok: fallos.length === 0,
      altas,
      avisos,
      fallos,
      porRegistro: resultados.map((r) => ({
        registro: r.registro,
        altas: r.altas.length,
        actualizadas: r.actualizadas,
        ilegible: r.ilegible ?? null,
        fuentesConProblema: r.fuentesConProblema ?? 0,
      })),
      execution: { id: tracker.runId, status, durationMs },
    });
  } catch (err) {
    await failCronRun(tracker, err);
    log.error("cron/registros", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
