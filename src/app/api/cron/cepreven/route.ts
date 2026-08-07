/**
 * /api/cron/cepreven
 * Vercel cron job — lunes 08:00 UTC.
 *
 * Refresca el estado Cepreven de las empresas a partir de las dos fuentes
 * públicas: el PDF de CALIFICADAS y la página de ASOCIADAS. Cepreven no
 * publica un feed ni versiona nada; el PDF vigente se localiza siguiendo el
 * enlace de su página de descargas, cuyo nombre de fichero lleva el número
 * de edición.
 *
 * Aplica solo lo que es seguro sin revisión (altas y cambios) y NOTIFICA lo
 * que no lo es:
 *   - BAJAS: la empresa ya no figura. Puede ser que haya salido del listado
 *     o que su nombre en la base no case con el de la fuente.
 *   - DEGRADACIONES: pasaría de calificada a asociada, que casi siempre es
 *     un fallo de cruce.
 * Ambas se revisan a mano y, si proceden, se aplican con
 * `scripts/import-cepreven.ts --apply --con-bajas`.
 *
 * Si el listado deja de parsearse (rediseño de la web, cambio de maquetado
 * del PDF) el resultado es 0 empresas: el job termina en WARNING y avisa,
 * en vez de vaciar la tabla en silencio.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CRON_JOBS,
  completeCronRun,
  failCronRun,
  startCronRun,
} from "@/lib/cron-runs";
import { notifyAdmins } from "@/lib/notifications";
import { log } from "@/lib/logger";
import { parseListadoCepreven } from "@/lib/cepreven/parse-listado";
import { fetchAsociados } from "@/lib/cepreven/parse-asociados";
import { escriturasSeguras, planificaSync, type EmpresaEstado } from "@/lib/cepreven/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const URL_DESCARGAS = "https://www.calificacioncepreven.com/Descarga-Documentos.html";
const AGENTE = "war-room/1.0 (+contacto@fontiber.com)";

/** Localiza y descarga el PDF de calificadas vigente. */
async function descargaListado(): Promise<{ pdf: Buffer; url: string }> {
  const portada = await fetch(URL_DESCARGAS, { headers: { "User-Agent": AGENTE } });
  if (!portada.ok) throw new Error(`HTTP ${portada.status} al abrir la página de descargas`);

  const html = await portada.text();
  const enlace = [...html.matchAll(/href="([^"]*Listado[^"]*\.pdf)"/gi)].map((m) => m[1])[0];
  if (!enlace) throw new Error("No se encontró el enlace al listado de calificación");

  const url = new URL(enlace.replace(/ /g, "%20"), URL_DESCARGAS).toString();
  const res = await fetch(url, { headers: { "User-Agent": AGENTE } });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);

  return { pdf: Buffer.from(await res.arrayBuffer()), url: decodeURIComponent(url) };
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tracker = await startCronRun({ job: CRON_JOBS.cepreven, source: "vercel" });

  try {
    const [{ pdf, url }, asociadas] = await Promise.all([
      descargaListado(),
      fetchAsociados(),
    ]);
    const listado = await parseListadoCepreven(pdf);

    log.info(
      "cron/cepreven",
      `${listado.empresas.length} calificadas y ${asociadas.length} asociadas`,
      { url }
    );

    // Guarda: si una fuente deja de parsearse, no se toca nada.
    if (listado.empresas.length === 0 || asociadas.length === 0) {
      const mensaje =
        `No se pudo leer alguna de las fuentes de Cepreven: ` +
        `${listado.empresas.length} calificadas, ${asociadas.length} asociadas. ` +
        `Probablemente hayan cambiado el formato del PDF o el diseño de la web. ` +
        `No se ha modificado ninguna empresa.`;
      await notifyAdmins({
        tipo: "cepreven_cron",
        titulo: "⚠️ Cepreven: listados ilegibles",
        mensaje,
        link: "/monitoring",
        email: true,
      });
      const durationMs = await completeCronRun(tracker, "WARNING", {
        calificadas: listado.empresas.length,
        asociadas: asociadas.length,
        aplicadas: 0,
      });
      return NextResponse.json({
        ok: false,
        motivo: "fuentes ilegibles",
        execution: { id: tracker.runId, status: "WARNING", durationMs },
      });
    }

    const empresas: EmpresaEstado[] = await prisma.empresa.findMany({
      select: { id: true, cif: true, nombre: true, cepreven: true, ceprevenAreas: true },
    });

    const plan = planificaSync(empresas, listado.empresas, asociadas);
    const escrituras = escriturasSeguras(plan);

    if (escrituras.length > 0) {
      // Una transacción: un fallo a media tanda dejaría unas empresas
      // actualizadas y otras no.
      await prisma.$transaction(
        escrituras.map((e) =>
          prisma.empresa.update({
            where: { id: e.id },
            data: { cepreven: e.cepreven, ceprevenAreas: e.ceprevenAreas },
          })
        )
      );
    }

    const nuevasCalificadas = plan.altas.filter((a) => a.cepreven === "calificada");
    const ascendidas = plan.cambios.filter((c) => c.cepreven === "calificada");

    // Solo se avisa cuando hay algo que mirar. Los cambios de áreas sin
    // altas son ruido semanal.
    const hayNovedad =
      plan.altas.length > 0 || plan.bajas.length > 0 || plan.degradaciones.length > 0;

    if (hayNovedad) {
      const partes: string[] = [];
      if (nuevasCalificadas.length > 0) {
        partes.push(
          `✅ ${nuevasCalificadas.length} nuevas CALIFICADAS: ` +
            nuevasCalificadas.map((e) => e.nombre).join(", ")
        );
      }
      const nuevasAsociadas = plan.altas.filter((a) => a.cepreven === "asociada");
      if (nuevasAsociadas.length > 0) {
        partes.push(
          `🔸 ${nuevasAsociadas.length} nuevas asociadas: ` +
            nuevasAsociadas.map((e) => e.nombre).join(", ")
        );
      }
      if (plan.bajas.length > 0) {
        partes.push(
          `⚠️ ${plan.bajas.length} ya no figuran (NO aplicado, revisar si es baja real ` +
            `o el nombre no casa): ` +
            plan.bajas.map((e) => e.nombre).join(", ")
        );
      }
      if (plan.degradaciones.length > 0) {
        partes.push(
          `⚠️ ${plan.degradaciones.length} perderían la calificación (NO aplicado): ` +
            plan.degradaciones.map((e) => e.nombre).join(", ")
        );
      }

      await notifyAdmins({
        tipo: "cepreven_cron",
        titulo: "🏅 Cepreven: novedades en los listados",
        mensaje: partes.join("\n\n"),
        link: "/",
        // Email solo si hay calificaciones nuevas o algo que revisar.
        email: nuevasCalificadas.length > 0 || plan.bajas.length > 0 || plan.degradaciones.length > 0,
      });
    }

    const status = plan.degradaciones.length > 0 ? "WARNING" : "SUCCESS";
    const durationMs = await completeCronRun(tracker, status, {
      calificadas: listado.empresas.length,
      asociadas: asociadas.length,
      aplicadas: escrituras.length,
      altas: plan.altas.length,
      cambios: plan.cambios.length,
      bajasSinAplicar: plan.bajas.length,
      degradacionesSinAplicar: plan.degradaciones.length,
      sinCasar: plan.sinCasar.calificadas.length + plan.sinCasar.asociadas.length,
    });

    return NextResponse.json({
      ok: true,
      url,
      calificadas: listado.empresas.length,
      asociadas: asociadas.length,
      aplicadas: escrituras.length,
      altas: plan.altas.map((e) => e.nombre),
      ascendidas: ascendidas.map((e) => e.nombre),
      bajasSinAplicar: plan.bajas.map((e) => e.nombre),
      degradacionesSinAplicar: plan.degradaciones.map((e) => e.nombre),
      execution: { id: tracker.runId, status, durationMs },
    });
  } catch (err) {
    await failCronRun(tracker, err);
    log.error("cron/cepreven", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
