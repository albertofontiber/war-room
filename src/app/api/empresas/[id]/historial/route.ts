import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { DEAL_STAGE_LABEL, TAREA_TIPO_LABEL, TAREA_TIPO_ICON, isValidDealStage, isValidTareaTipo } from "@/lib/crm";

export const dynamic = "force-dynamic";

function stageLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return isValidDealStage(s) ? DEAL_STAGE_LABEL[s] : s;
}

function tareaIconLabel(tipo: string): string {
  return isValidTareaTipo(tipo)
    ? `${TAREA_TIPO_ICON[tipo]} ${TAREA_TIPO_LABEL[tipo]}`
    : tipo;
}

/**
 * GET /api/empresas/[id]/historial
 *
 * Timeline cronológico unificado (eventos ocurridos, no elementos pendientes):
 *   - Actividad (llamadas, emails, reuniones — legacy de Pipedrive)
 *   - CrmLog (cambios de stage)
 *   - Tarea **completadas** (1 sola entrada por tarea, en su fecha de cierre)
 *
 * NO incluye: tareas pendientes (se ven en la sección Tareas) ni notas generales.
 *
 * Orden: más reciente primero.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const [actividades, logs, tareasCompletadas] = await Promise.all([
      prisma.actividad.findMany({
        where: { empresaId, tipo: { in: ["llamada", "email", "reunion"] } },
        include: {
          autorUser: { select: { id: true, name: true } },
          autorFinder: { select: { id: true, name: true } },
        },
        orderBy: { fecha: "desc" },
      }),
      prisma.crmLog.findMany({
        where: { empresaId },
        include: {
          autor: { select: { id: true, name: true } },
          autorFinder: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tarea.findMany({
        where: { empresaId, completada: true, completadaAt: { not: null } },
        include: {
          autor: { select: { id: true, name: true } },
          autorFinder: { select: { id: true, name: true } },
          asignado: { select: { id: true, name: true } },
          asignadoFinder: { select: { id: true, name: true } },
        },
        orderBy: { completadaAt: "desc" },
      }),
    ]);

    type Item = {
      kind: "actividad" | "stage" | "tarea_completada";
      fecha: string;
      autor: string | null;
      autorKind: "admin" | "finder" | "pipedrive" | null;
      texto: string;
      meta?: Record<string, unknown>;
      id: string;
    };

    const items: Item[] = [];

    for (const a of actividades) {
      const autorKind: Item["autorKind"] = a.autorFinder
        ? "finder"
        : a.autorUser
        ? "admin"
        : a.pipedriveId
        ? "pipedrive"
        : null;
      items.push({
        id: `act-${a.id}`,
        kind: "actividad",
        fecha: a.fecha.toISOString(),
        autor: a.autorFinder?.name ?? a.autorUser?.name ?? a.autor ?? null,
        autorKind,
        texto: a.texto ?? "",
        meta: { tipo: a.tipo, pipedrive: !!a.pipedriveId },
      });
    }

    for (const l of logs) {
      const texto =
        l.event === "new_deal"
          ? `Entró al funnel en ${stageLabel(l.toStage)}`
          : l.event === "removed_from_funnel"
          ? `Salió del funnel (estaba en ${stageLabel(l.fromStage)})`
          : `Cambió de ${stageLabel(l.fromStage)} a ${stageLabel(l.toStage)}`;
      items.push({
        id: `log-${l.id}`,
        kind: "stage",
        fecha: l.createdAt.toISOString(),
        autor: l.autorFinder?.name ?? l.autor?.name ?? l.owner ?? null,
        autorKind: l.autorFinder ? "finder" : l.autor ? "admin" : null,
        texto: l.note ? `${texto} — ${l.note}` : texto,
        meta: { event: l.event, fromStage: l.fromStage, toStage: l.toStage },
      });
    }

    for (const t of tareasCompletadas) {
      const completadaPorFinder = !!t.asignadoFinder || (!t.asignado && !!t.autorFinder);
      items.push({
        id: `tarea-done-${t.id}`,
        kind: "tarea_completada",
        fecha: t.completadaAt!.toISOString(),
        autor:
          t.asignadoFinder?.name ??
          t.asignado?.name ??
          t.autorFinder?.name ??
          t.autor?.name ??
          null,
        autorKind: completadaPorFinder ? "finder" : "admin",
        texto: `${tareaIconLabel(t.tipo)} · ${t.titulo}${
          t.descripcion ? ` — ${t.descripcion}` : ""
        }`,
        meta: { tareaId: t.id, tipo: t.tipo },
      });
    }

    items.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    return NextResponse.json(items);
  } catch (err) {
    console.error("[GET historial]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
