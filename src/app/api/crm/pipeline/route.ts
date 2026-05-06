import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEAL_STAGES, diasDesde } from "@/lib/crm";
import { log } from "@/lib/logger";
import type { DealStage } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/pipeline
 *
 * Lista de empresas del funnel, agrupadas por dealStage, con los datos
 * necesarios para pintar cada tarjeta del Kanban:
 *   - nombre, CIF, ingresos, EBITDA, margen%, owner
 *   - última actividad (= última Tarea completada, tras unificación Tarea+Actividad)
 *   - nº tareas pendientes
 *   - días en stage actual
 *
 * Solo empresas con enPerimetro=true Y con `crmEstado.dealStage` no null
 * aparecen. Las empresas "Sin CRM" se gestionan desde mapa/tabla con su pill
 * propia (sentinel `sin_crm` en filtros, ver `lib/crm.ts`).
 *
 * Query params opcionales (filtros):
 *   ?ccaa=...   (comma-separated)
 *   ?provincia=...
 *   ?sector=PCI|seguridad_electronica|mixto
 *   ?owner=<userId>     (filtra por CrmEstado.ownerUserId)
 *   ?finder=<finderId>|__none__  (filtra por Empresa.finderSourceId)
 *   ?conTarea=true      (solo empresas con al menos una tarea pendiente)
 *   ?diasSinActividadMin=<n>     (post-filter en código sobre actividad reciente)
 *
 * Nota: la búsqueda por nombre/CIF NO está aquí. La barra global del Navbar
 * (war room top) cubre ese caso de uso. Si en el futuro se reactiva el filtro
 * de listado por texto, añadir `?q=` y el bloque `OR` sobre nombre/cif.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const ccaa = url.searchParams.get("ccaa")?.split(",").filter(Boolean) ?? [];
    const provincia = url.searchParams.get("provincia")?.split(",").filter(Boolean) ?? [];
    const sector = url.searchParams.get("sector")?.split(",").filter(Boolean) ?? [];
    const owner = url.searchParams.get("owner") ?? null;
    const finder = url.searchParams.get("finder") ?? null;
    const conTarea = url.searchParams.get("conTarea") === "true";
    const diasSinActividadMinParam = url.searchParams.get("diasSinActividadMin");
    const diasSinActividadMin = diasSinActividadMinParam
      ? Number(diasSinActividadMinParam)
      : null;

    // Filtros base: solo perímetro Y con dealStage real (no null).
    // Las empresas "Sin CRM" (sin crmEstado o con dealStage null) se excluyen
    // — no son parte del Pipeline; se gestionan desde mapa/tabla.
    const whereBase: Parameters<typeof prisma.empresa.findMany>[0] = {
      where: {
        enPerimetro: true,
        ...(ccaa.length ? { ccaa: { in: ccaa } } : {}),
        ...(provincia.length ? { provincia: { in: provincia } } : {}),
        ...(sector.length ? { sector: { in: sector } } : {}),
        crmEstado: {
          dealStage: { not: null },
          ...(owner ? { ownerUserId: owner } : {}),
        },
        ...(finder === "__none__"
          ? { finderSourceId: null }
          : finder
          ? { finderSourceId: finder }
          : {}),
        ...(conTarea
          ? {
              tareas: { some: { completada: false } },
            }
          : {}),
      },
    };

    const empresas = await prisma.empresa.findMany({
      ...whereBase,
      include: {
        financieros: { orderBy: { anio: "desc" }, take: 1 },
        crmEstado: {
          include: {
            ownerUser: { select: { id: true, name: true } },
          },
        },
        finderSource: { select: { id: true, name: true } },
        grupo: { select: { id: true, nombre: true } },
        // última actividad real = última Tarea completada (la fusión Tarea+Actividad
        // hizo que llamadas/emails/reuniones legacy migraran a Tarea.completada=true).
        // Notas no cuentan — viven en su propio modelo.
        tareas: {
          where: { completada: true, completadaAt: { not: null } },
          orderBy: { completadaAt: "desc" },
          take: 1,
          select: { completadaAt: true, tipo: true },
        },
        _count: {
          select: {
            tareas: { where: { completada: false } },
          },
        },
      },
      orderBy: [{ nombre: "asc" }],
    });

    type Card = {
      id: number;
      cif: string;
      nombre: string;
      ccaa: string | null;
      provincia: string | null;
      sector: string | null;
      web: string | null;
      grupoNombre: string | null;
      dealStage: DealStage | null;
      ingresos: number | null;
      margenBrutoPct: number | null;
      ebitda: number | null;
      ownerUserId: string | null;
      ownerName: string | null;
      finderName: string | null;
      finderId: string | null;
      ultimaActividad: { fecha: string; tipo: string } | null;
      diasSinActividad: number | null;
      diasEnStage: number | null;
      tareasPendientes: number;
      esAnonima: boolean;
    };

    const tarjetas: Card[] = empresas.map((e) => {
      const fin = e.financieros[0] ?? null;
      const ingresos = fin?.ingresos ?? null;
      const margenBruto = fin?.margenBruto ?? null;
      const margenBrutoPct =
        ingresos && margenBruto ? (margenBruto / ingresos) * 100 : null;
      const ebitda = fin?.ebitda ?? null;

      const ultima = e.tareas[0] ?? null;
      const ultimaFecha = ultima?.completadaAt ?? null;
      const diasSinActividad = ultimaFecha ? diasDesde(ultimaFecha) : null;

      // Usamos SOLO fechaEntradaStage; no caer a updatedAt como heurística (lo
      // cambia cualquier edición y daría diasEnStage=0 engañoso). Si está null,
      // diasEnStage queda null y la UI muestra "—".
      const fechaEntrada = e.crmEstado?.fechaEntradaStage ?? null;
      const diasEnStage = fechaEntrada ? diasDesde(fechaEntrada) : null;

      return {
        id: e.id,
        cif: e.cif,
        nombre: e.nombre,
        ccaa: e.ccaa,
        provincia: e.provincia,
        sector: e.sector,
        web: e.web,
        grupoNombre: e.grupo?.nombre ?? null,
        dealStage: (e.crmEstado?.dealStage as DealStage | undefined) ?? null,
        ingresos,
        margenBrutoPct,
        ebitda,
        ownerUserId: e.crmEstado?.ownerUserId ?? null,
        ownerName: e.crmEstado?.ownerUser?.name ?? null,
        finderName: e.finderSource?.name ?? null,
        finderId: e.finderSource?.id ?? null,
        ultimaActividad: ultima && ultimaFecha
          ? { fecha: ultimaFecha.toISOString(), tipo: ultima.tipo }
          : null,
        diasSinActividad,
        diasEnStage,
        tareasPendientes: e._count.tareas,
        esAnonima: e.esAnonima,
      };
    });

    // Filtro en memoria: días sin actividad ≥ N
    const filtered =
      diasSinActividadMin != null && Number.isFinite(diasSinActividadMin)
        ? tarjetas.filter((t) => {
            if (t.diasSinActividad == null) return true; // si nunca hubo actividad, incluir
            return t.diasSinActividad >= diasSinActividadMin;
          })
        : tarjetas;

    // Agrupar por stage. Tras el `where` de arriba todas las cards tienen
    // `dealStage` no null; el guard es defensa por si la BD se queda en estado
    // inconsistente.
    const grouped: Record<DealStage, Card[]> = {
      identificado: [],
      contactado: [],
      primera_reunion: [],
      analisis: [],
      "LOI enviada": [],
      execution: [],
      portfolio: [],
      on_hold: [],
      muerto: [],
    };

    for (const card of filtered) {
      if (!card.dealStage) continue;
      grouped[card.dealStage].push(card);
    }

    const counts = Object.fromEntries(
      DEAL_STAGES.map((s) => [s, grouped[s].length])
    ) as Record<DealStage, number>;

    return NextResponse.json({
      stages: DEAL_STAGES,
      grouped,
      counts,
      total: filtered.length,
    });
  } catch (err) {
    log.error("api/crm/pipeline GET", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
