/**
 * /api/cron/habilitaciones
 * Vercel cron job — día 1 de cada mes, 08:30 UTC.
 *
 * Refresca las habilitaciones de seguridad privada desde los tres registros
 * públicos. Cada uno se obtiene de una forma distinta:
 *
 *   - Cataluña: API de datos abiertos. Directa.
 *   - Euskadi:  PDF en URL estable. Directo.
 *   - Nacional: no hay URL estable ni índice; hay que sondear nombres de
 *     fichero por fecha (ver `localiza-listado.ts`). Si no aparece edición
 *     nueva en la ventana, se sigue adelante con los otros dos: que la Policía
 *     no haya publicado nada este mes es lo normal, no un error.
 *
 * Aplica altas y actualizaciones. Lo que NO toca es lo que se queda sin
 * respaldo —empresas con habilitaciones guardadas que ya no figuran en ningún
 * registro—: eso se notifica para mirarlo, porque tanto puede ser una baja
 * real como que el registro haya dejado de publicarlas.
 *
 * Mensual y no semanal porque estos registros se mueven dos o tres veces al
 * año.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CRON_JOBS,
  completeCronRun,
  failCronRun,
  startCronRun,
} from "@/lib/cron-runs";
import { notifyAdmins } from "@/lib/notifications";
import { log } from "@/lib/logger";
import { parseListadoPolicia } from "@/lib/policia/parse-empresas";
import { parseRegistroEuskadi } from "@/lib/policia/parse-euskadi";
import { fetchRegistroCatalunya } from "@/lib/policia/fetch-catalunya";
import { descargaListado, localizaListado } from "@/lib/policia/localiza-listado";
import { ETIQUETA_HABILITACION } from "@/lib/policia/habilitaciones";
import {
  planificaHabilitaciones,
  type EmpresaBase,
  type EmpresaRegistro,
} from "@/lib/policia/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tracker = await startCronRun({ job: CRON_JOBS.habilitaciones, source: "vercel" });

  try {
    // Los dos que tienen dirección fija van en paralelo; el nacional aparte,
    // porque su localización es lenta y puede no dar nada.
    const [catalunya, euskadi] = await Promise.all([
      fetchRegistroCatalunya(),
      parseRegistroEuskadi(),
    ]);

    let nacional: EmpresaRegistro[] = [];
    let edicionNacional: string | null = null;
    const hallado = await localizaListado(new Date());
    if (hallado) {
      edicionNacional = hallado.fecha.toISOString().slice(0, 10);
      nacional = await parseListadoPolicia(await descargaListado(hallado.url));
    }

    log.info(
      "cron/habilitaciones",
      `nacional ${nacional.length} · catalunya ${catalunya.length} · euskadi ${euskadi.length}`,
      { edicionNacional }
    );

    // Guarda contra el fallo silencioso: si los dos registros de dirección fija
    // vienen vacíos, es que ha cambiado el formato, no que se hayan quedado sin
    // empresas. No se toca nada.
    if (catalunya.length === 0 && euskadi.length === 0) {
      await notifyAdmins({
        tipo: "habilitaciones_cron",
        titulo: "⚠️ Registros de seguridad privada ilegibles",
        mensaje:
          "Ni el registro catalán ni el vasco han devuelto empresas. Lo más " +
          "probable es que hayan cambiado el formato de publicación. No se ha " +
          "modificado ninguna empresa.",
        link: "/monitoring",
        email: true,
      });
      const durationMs = await completeCronRun(tracker, "WARNING", {
        nacional: nacional.length,
        catalunya: 0,
        euskadi: 0,
        aplicadas: 0,
      });
      return NextResponse.json({
        ok: false,
        motivo: "registros ilegibles",
        execution: { id: tracker.runId, status: "WARNING", durationMs },
      });
    }

    const empresas: EmpresaBase[] = await prisma.empresa.findMany({
      select: {
        id: true, cif: true, nombre: true, sector: true,
        habilitaciones: true, ambitoGeo: true,
      },
    });

    const plan = planificaHabilitaciones(empresas, [
      { registro: "policia", empresas: nacional },
      { registro: "catalunya", empresas: catalunya },
      { registro: "euskadi", empresas: euskadi },
    ]);

    if (plan.actualizaciones.length || plan.altas.length) {
      await prisma.$transaction([
        ...plan.actualizaciones.map((a) =>
          prisma.empresa.update({
            where: { id: a.id },
            data: {
              habilitaciones: a.habilitaciones as Prisma.InputJsonValue,
              ambitoGeo: a.ambitoGeo,
              registroFuente: a.registroFuente,
            },
          })
        ),
        ...plan.altas.map((a) =>
          prisma.empresa.create({
            data: {
              cif: a.cif,
              nombre: a.nombre,
              sector: "seguridad_electronica",
              enPerimetro: true,
              provincia: "",
              ccaa: "",
              habilitaciones: a.habilitaciones as Prisma.InputJsonValue,
              ambitoGeo: a.ambitoGeo,
              registroFuente: a.registroFuente,
              fuente: `registro_${a.registroFuente}`,
            },
          })
        ),
      ]);
    }

    // Solo se avisa cuando hay algo que mirar: las actualizaciones de rutina
    // serían ruido mensual.
    if (plan.altas.length || plan.sinRespaldo.length) {
      const partes: string[] = [];
      if (plan.altas.length) {
        partes.push(
          `✅ ${plan.altas.length} instaladoras nuevas en el registro:\n` +
            plan.altas
              .map((a) => {
                const hab = Object.entries(a.habilitaciones)
                  .map(([k, v]) => `${ETIQUETA_HABILITACION[k] ?? k} (${v === "E" ? "estatal" : "autonómico"})`)
                  .join(", ");
                return `· ${a.nombre} — ${hab}`;
              })
              .join("\n")
        );
      }
      if (plan.sinRespaldo.length) {
        partes.push(
          `⚠️ ${plan.sinRespaldo.length} ya no figuran en ningún registro ` +
            `(NO aplicado; puede ser baja real o que el registro deje de publicarlas): ` +
            plan.sinRespaldo.map((e) => e.nombre).join(", ")
        );
      }
      if (edicionNacional) partes.push(`Edición del listado nacional: ${edicionNacional}.`);

      await notifyAdmins({
        tipo: "habilitaciones_cron",
        titulo: "🛡️ Registro de seguridad privada: novedades",
        mensaje: partes.join("\n\n"),
        link: "/",
        email: plan.altas.length > 0 || plan.sinRespaldo.length > 0,
      });
    }

    const durationMs = await completeCronRun(tracker, "SUCCESS", {
      edicionNacional,
      nacional: nacional.length,
      catalunya: catalunya.length,
      euskadi: euskadi.length,
      altas: plan.altas.length,
      actualizaciones: plan.actualizaciones.length,
      sinRespaldo: plan.sinRespaldo.length,
      descartadasSinInstalacion: plan.descartadasSinInstalacion,
    });

    return NextResponse.json({
      ok: true,
      edicionNacional,
      altas: plan.altas.map((a) => a.nombre),
      actualizaciones: plan.actualizaciones.length,
      sinRespaldo: plan.sinRespaldo.map((e) => e.nombre),
      execution: { id: tracker.runId, status: "SUCCESS", durationMs },
    });
  } catch (err) {
    await failCronRun(tracker, err);
    log.error("cron/habilitaciones", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
