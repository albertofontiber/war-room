/**
 * /api/cron/ripci
 * Vercel cron job — día 1 de cada mes, 09:00 UTC.
 *
 * Refresca las categorías del RIPCI (RD 513/2017) desde el buscador público
 * del Registro Integrado Industrial.
 *
 * Solo pide las inscripciones de los últimos `DIAS_VENTANA` días, no el
 * registro entero, por dos razones: el volcado completo son ~97.000 filas y
 * unas dos horas, y sobre todo el servidor reejecuta la consulta en cada salto
 * de página, así que **el coste por página crece con el tamaño del
 * resultado**. Acotando por fecha, una pasada son unos segundos.
 *
 * La ventana se solapa con la anterior a propósito: si un mes falla, al
 * siguiente se recupera lo que se hubiera perdido.
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
import {
  consultaDesde,
  consultaPorNif,
  formatoFecha,
  type FilaRipci,
} from "@/lib/ripci/buscador";
import { consolida, planificaRipci, type EmpresaBase } from "@/lib/ripci/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 45 días: cubre el mes corrido y deja margen si una pasada falla. */
const DIAS_VENTANA = 45;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tracker = await startCronRun({ job: CRON_JOBS.ripci, source: "vercel" });

  try {
    const desde = formatoFecha(new Date(Date.now() - DIAS_VENTANA * 86_400_000));

    const filas: FilaRipci[] = [];
    for (const seccion of ["D", "E"] as const) {
      filas.push(...(await consultaDesde(seccion, desde)));
    }

    const delRegistro = consolida(filas);
    log.info(
      "cron/ripci",
      `${filas.length} filas desde ${desde} -> ${delRegistro.length} empresas`
    );

    // Guarda contra el fallo silencioso: si el buscador cambia de formato, el
    // parser devuelve 0 filas. Cero empresas en 45 días es anómalo —salen unas
    // decenas al mes— así que se avisa y no se toca nada.
    if (filas.length === 0) {
      await notifyAdmins({
        tipo: "ripci_cron",
        titulo: "⚠️ El buscador del RIPCI no devolvió nada",
        mensaje:
          `Ninguna inscripción desde ${desde}, cuando lo normal son decenas al mes. ` +
          `Lo más probable es que hayan cambiado el formulario o la tabla de resultados. ` +
          `No se ha modificado ninguna empresa.`,
        link: "/monitoring",
        email: true,
      });
      const durationMs = await completeCronRun(tracker, "WARNING", { filas: 0, empresas: 0 });
      return NextResponse.json({
        ok: false,
        motivo: "sin resultados",
        execution: { id: tracker.runId, status: "WARNING", durationMs },
      });
    }

    const empresas: EmpresaBase[] = await prisma.empresa.findMany({
      select: { id: true, cif: true, nombre: true, ripci: true },
    });

    // La consulta por fecha solo trae las categorías inscritas DENTRO de la
    // ventana, no el estado completo de cada empresa. Guardar eso tal cual
    // borraría las categorías más antiguas, así que de las que parecen haber
    // cambiado se vuelve a pedir la ficha entera por NIF. Son unas pocas al
    // mes, y así queda la foto correcta en vez de un recorte.
    const candidatas = planificaRipci(empresas, delRegistro);
    const aRevisar = [...candidatas.altas, ...candidatas.actualizaciones];

    const completas = [];
    for (const c of aRevisar) {
      const filasEmpresa: FilaRipci[] = [];
      for (const seccion of ["D", "E"] as const) {
        filasEmpresa.push(...(await consultaPorNif(seccion, c.nif)));
      }
      const [entera] = consolida(filasEmpresa);
      if (entera) completas.push(entera);
    }

    const plan = planificaRipci(empresas, completas);

    const paquete = (r: { instalacion: string[]; mantenimiento: string[] }) =>
      ({ instalacion: r.instalacion, mantenimiento: r.mantenimiento }) as Prisma.InputJsonValue;

    if (plan.actualizaciones.length || plan.altas.length) {
      await prisma.$transaction([
        ...plan.actualizaciones.map((r) =>
          prisma.empresa.update({
            where: { id: r.id },
            data: {
              ripci: paquete(r),
              ...(r.desde ? { ripciAlta: new Date(r.desde) } : {}),
            },
          })
        ),
        ...plan.altas.map((r) =>
          prisma.empresa.create({
            data: {
              cif: r.nif,
              nombre: r.titular,
              // Tienen habilitación de contra incendios: entran como PCI.
              sector: "PCI",
              enPerimetro: true,
              provincia: "",
              ccaa: r.ccaa,
              ripci: paquete(r),
              ...(r.desde ? { ripciAlta: new Date(r.desde) } : {}),
              fuente: "ripci",
            },
          })
        ),
      ]);
    }

    // Solo se avisa de las altas: las actualizaciones de categorías son
    // rutina y serían ruido mensual.
    if (plan.altas.length) {
      await notifyAdmins({
        tipo: "ripci_cron",
        titulo: `🔥 ${plan.altas.length} empresas nuevas con habilitación RIPCI`,
        mensaje: plan.altas
          .map(
            (a) =>
              `· ${a.titular} (${a.nif}, ${a.ccaa}) — ` +
              `${a.instalacion.length} categorías de instalación y ${a.mantenimiento.length} de mantenimiento`
          )
          .join("\n"),
        link: "/",
        email: true,
      });
    }

    const durationMs = await completeCronRun(tracker, "SUCCESS", {
      desde,
      filas: filas.length,
      empresas: delRegistro.length,
      altas: plan.altas.length,
      actualizaciones: plan.actualizaciones.length,
    });

    return NextResponse.json({
      ok: true,
      desde,
      empresas: delRegistro.length,
      altas: plan.altas.map((a) => a.titular),
      actualizaciones: plan.actualizaciones.length,
      execution: { id: tracker.runId, status: "SUCCESS", durationMs },
    });
  } catch (err) {
    await failCronRun(tracker, err);
    log.error("cron/ripci", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
