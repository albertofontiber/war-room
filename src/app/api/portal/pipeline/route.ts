import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { FINDER_STATUSES, FINDER_STATUS_MAP, diasDesde } from "@/lib/crm";
import type { FinderStatus } from "@/lib/crm";
import type { DealStage } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/pipeline
 *
 * Kanban del finder. Solo empresas con `finderSourceId === session.finderId`
 * y no anónimas. Columnas agregadas (6 estados, ver FINDER_STATUS_MAP) — el
 * stage interno del funnel NUNCA se expone al finder.
 *
 * Campos devueltos por tarjeta: nombre, provincia/sector, última actividad,
 * días desde última actividad, tareas pendientes suyas. Sin CIF, financieros,
 * owner interno, BORME.
 */
export async function GET() {
  try {
    const finder = await requireCurrentFinder();

    const empresas = await prisma.empresa.findMany({
      where: {
        finderSourceId: finder.id,
        esAnonima: false,
      },
      select: {
        id: true,
        nombre: true,
        provincia: true,
        ccaa: true,
        sector: true,
        crmEstado: { select: { dealStage: true, fechaEntradaStage: true } },
        actividades: {
          where: { tipo: { in: ["llamada", "email", "reunion"] } },
          orderBy: { fecha: "desc" },
          take: 1,
          select: { fecha: true, tipo: true },
        },
        _count: {
          select: {
            tareas: {
              where: {
                completada: false,
                OR: [
                  { asignadoFinderId: finder.id },
                  { autorFinderId: finder.id },
                ],
              },
            },
          },
        },
      },
      orderBy: [{ nombre: "asc" }],
    });

    type Card = {
      id: number;
      nombre: string;
      provincia: string | null;
      ccaa: string | null;
      sector: string | null;
      status: FinderStatus;
      diasEnStatus: number | null;
      ultimaActividad: { fecha: string; tipo: string } | null;
      diasSinActividad: number | null;
      tareasPendientes: number;
    };

    const tarjetas: Card[] = empresas.map((e) => {
      const stage = (e.crmEstado?.dealStage as DealStage | undefined) ?? "identificado";
      const status = FINDER_STATUS_MAP[stage] ?? "Pendiente";
      const ultima = e.actividades[0] ?? null;
      return {
        id: e.id,
        nombre: e.nombre,
        provincia: e.provincia,
        ccaa: e.ccaa,
        sector: e.sector,
        status,
        diasEnStatus: e.crmEstado?.fechaEntradaStage
          ? diasDesde(e.crmEstado.fechaEntradaStage)
          : null,
        ultimaActividad: ultima
          ? { fecha: ultima.fecha.toISOString(), tipo: ultima.tipo }
          : null,
        diasSinActividad: ultima ? diasDesde(ultima.fecha) : null,
        tareasPendientes: e._count.tareas,
      };
    });

    const grouped: Record<FinderStatus, Card[]> = {
      Pendiente: [],
      Contactado: [],
      "En negociación": [],
      Cerrado: [],
      "En pausa": [],
      Descartado: [],
    };
    for (const c of tarjetas) grouped[c.status].push(c);

    const counts = Object.fromEntries(
      FINDER_STATUSES.map((s) => [s, grouped[s].length])
    ) as Record<FinderStatus, number>;

    return NextResponse.json({
      statuses: FINDER_STATUSES,
      grouped,
      counts,
      total: tarjetas.length,
      finder: { id: finder.id, name: finder.name },
    });
  } catch (err) {
    if ((err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/portal/pipeline]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
