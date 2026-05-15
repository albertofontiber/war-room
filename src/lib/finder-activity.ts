import { prisma } from "@/lib/prisma";
import type { FinderAction } from "@/lib/finder-access-log";
import type { Prisma } from "@prisma/client";

/**
 * Helpers de lectura sobre `FinderAccessLog` para el chat IA admin y otros
 * consumidores (futura UI `/finders/activity`). Mantenidos aquí para no mezclar
 * la lógica de queries con el handler del chat.
 */

export interface ListFinderActivityFilters {
  finderName?: string;
  finderId?: string;
  action?: FinderAction;
  desde?: Date;
  hasta?: Date;
  limit?: number;
}

export interface FinderActivityRow {
  ts: string;
  finderId: string | null;
  finder: string | null;
  email: string | null;
  action: string;
  resourceId: string | null;
  empresa: { id: number; nombre: string } | null;
  ip: string | null;
}

const EMPRESA_RESOURCE_ACTIONS: ReadonlySet<string> = new Set(["view_deal"]);
const NOTA_RESOURCE_ACTIONS: ReadonlySet<string> = new Set([
  "add_note",
  "edit_note",
  "delete_note",
]);
const TAREA_RESOURCE_ACTIONS: ReadonlySet<string> = new Set([
  "add_task",
  "edit_task",
  "complete_task",
  "delete_task",
]);

/**
 * Lista actividad del log con filtros. Resuelve `empresa` siguiendo el
 * `resourceId` según el tipo de `action`:
 *   - view_deal              → resourceId = Empresa.id
 *   - add/edit/delete _note  → resourceId = Nota.id        (JOIN para empresa)
 *   - add/edit/complete/delete _task → resourceId = Tarea.id (JOIN para empresa)
 *   - login_x, view_deals    → empresa = null
 *   - propose_target_x       → empresa = null (TargetProposal puede no estar
 *                              ligada todavía a una Empresa; no merece JOIN
 *                              condicional aquí).
 */
export async function listFinderActivity(
  filters: ListFinderActivityFilters
): Promise<{ rows: FinderActivityRow[]; count: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

  const where: Prisma.FinderAccessLogWhereInput = {};
  if (filters.action) where.action = filters.action;
  if (filters.finderId) where.finderId = filters.finderId;
  if (filters.finderName) {
    where.finder = {
      is: { name: { contains: filters.finderName, mode: "insensitive" } },
    };
  }
  if (filters.desde || filters.hasta) {
    where.createdAt = {};
    if (filters.desde) where.createdAt.gte = filters.desde;
    if (filters.hasta) where.createdAt.lte = filters.hasta;
  }

  const logs = await prisma.finderAccessLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      finderId: true,
      email: true,
      action: true,
      resourceId: true,
      ip: true,
      finder: { select: { name: true } },
    },
  });

  // Recolectar ids a resolver según el tipo de acción.
  const empresaIds = new Set<number>();
  const notaIds = new Set<number>();
  const tareaIds = new Set<number>();

  for (const l of logs) {
    if (!l.resourceId) continue;
    const n = Number(l.resourceId);
    if (!Number.isFinite(n)) continue;
    if (EMPRESA_RESOURCE_ACTIONS.has(l.action)) empresaIds.add(n);
    else if (NOTA_RESOURCE_ACTIONS.has(l.action)) notaIds.add(n);
    else if (TAREA_RESOURCE_ACTIONS.has(l.action)) tareaIds.add(n);
  }

  const [empresas, notas, tareas] = await Promise.all([
    empresaIds.size > 0
      ? prisma.empresa.findMany({
          where: { id: { in: Array.from(empresaIds) } },
          select: { id: true, nombre: true },
        })
      : Promise.resolve([] as { id: number; nombre: string }[]),
    notaIds.size > 0
      ? prisma.nota.findMany({
          where: { id: { in: Array.from(notaIds) } },
          select: { id: true, empresa: { select: { id: true, nombre: true } } },
        })
      : Promise.resolve([] as { id: number; empresa: { id: number; nombre: string } | null }[]),
    tareaIds.size > 0
      ? prisma.tarea.findMany({
          where: { id: { in: Array.from(tareaIds) } },
          select: { id: true, empresa: { select: { id: true, nombre: true } } },
        })
      : Promise.resolve([] as { id: number; empresa: { id: number; nombre: string } | null }[]),
  ]);

  const empresaById = new Map(empresas.map((e) => [e.id, e]));
  const empresaByNotaId = new Map(notas.map((n) => [n.id, n.empresa]));
  const empresaByTareaId = new Map(tareas.map((t) => [t.id, t.empresa]));

  const rows: FinderActivityRow[] = logs.map((l) => {
    let empresa: { id: number; nombre: string } | null = null;
    if (l.resourceId) {
      const n = Number(l.resourceId);
      if (Number.isFinite(n)) {
        if (EMPRESA_RESOURCE_ACTIONS.has(l.action)) {
          empresa = empresaById.get(n) ?? null;
        } else if (NOTA_RESOURCE_ACTIONS.has(l.action)) {
          empresa = empresaByNotaId.get(n) ?? null;
        } else if (TAREA_RESOURCE_ACTIONS.has(l.action)) {
          empresa = empresaByTareaId.get(n) ?? null;
        }
      }
    }
    return {
      ts: l.createdAt.toISOString(),
      finderId: l.finderId,
      finder: l.finder?.name ?? null,
      email: l.email,
      action: l.action,
      resourceId: l.resourceId,
      empresa,
      ip: l.ip,
    };
  });

  return { rows, count: rows.length };
}

export type SummaryGroupBy = "finder" | "accion" | "dia" | "finder_accion";

export interface SummarizeFilters {
  desde?: Date;
  hasta?: Date;
  groupBy: SummaryGroupBy;
}

export interface SummaryRow {
  finder?: string | null;
  finderId?: string | null;
  action?: string;
  dia?: string; // ISO date (YYYY-MM-DD), zona Europe/Madrid
  count: number;
}

/**
 * Agrega counts sobre `FinderAccessLog`. Devuelve filas ordenadas por count desc.
 * Cuando `groupBy = "dia"`, el día se calcula en `Europe/Madrid` para que cuadre
 * con cómo lee Alberto los datos (resúmenes diarios).
 */
export async function summarizeFinderActivity(
  filters: SummarizeFilters
): Promise<{ rows: SummaryRow[] }> {
  const where: Prisma.FinderAccessLogWhereInput = {};
  if (filters.desde || filters.hasta) {
    where.createdAt = {};
    if (filters.desde) where.createdAt.gte = filters.desde;
    if (filters.hasta) where.createdAt.lte = filters.hasta;
  }

  // Prisma `groupBy` cubre finder/action; para "dia" o combinaciones tocamos
  // SQL crudo para usar `DATE_TRUNC` con zona horaria.
  if (filters.groupBy === "dia" || filters.groupBy === "finder_accion") {
    const desde = filters.desde ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const hasta = filters.hasta ?? new Date();

    if (filters.groupBy === "dia") {
      const rows = await prisma.$queryRaw<Array<{ dia: Date; count: bigint }>>`
        SELECT
          DATE_TRUNC('day', "createdAt" AT TIME ZONE 'Europe/Madrid')::date AS dia,
          COUNT(*)::bigint AS count
        FROM "FinderAccessLog"
        WHERE "createdAt" >= ${desde} AND "createdAt" <= ${hasta}
        GROUP BY dia
        ORDER BY dia DESC
      `;
      return {
        rows: rows.map((r) => ({
          dia:
            r.dia instanceof Date
              ? r.dia.toISOString().slice(0, 10)
              : String(r.dia).slice(0, 10),
          count: Number(r.count),
        })),
      };
    }

    // finder_accion
    const rows = await prisma.$queryRaw<
      Array<{ finderId: string | null; name: string | null; action: string; count: bigint }>
    >`
      SELECT
        fal."finderId" AS "finderId",
        f.name AS name,
        fal.action AS action,
        COUNT(*)::bigint AS count
      FROM "FinderAccessLog" fal
      LEFT JOIN "Finder" f ON f.id = fal."finderId"
      WHERE fal."createdAt" >= ${desde} AND fal."createdAt" <= ${hasta}
      GROUP BY fal."finderId", f.name, fal.action
      ORDER BY count DESC
    `;
    return {
      rows: rows.map((r) => ({
        finderId: r.finderId,
        finder: r.name,
        action: r.action,
        count: Number(r.count),
      })),
    };
  }

  if (filters.groupBy === "accion") {
    const grouped = await prisma.finderAccessLog.groupBy({
      by: ["action"],
      where,
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
    });
    return {
      rows: grouped.map((g) => ({
        action: g.action,
        count: g._count._all,
      })),
    };
  }

  // groupBy = "finder"
  const grouped = await prisma.finderAccessLog.groupBy({
    by: ["finderId"],
    where,
    _count: { _all: true },
    orderBy: { _count: { finderId: "desc" } },
  });
  const ids = grouped.map((g) => g.finderId).filter((x): x is string => !!x);
  const finders =
    ids.length > 0
      ? await prisma.finder.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(finders.map((f) => [f.id, f.name]));
  return {
    rows: grouped.map((g) => ({
      finderId: g.finderId,
      finder: g.finderId ? nameById.get(g.finderId) ?? null : null,
      count: g._count._all,
    })),
  };
}
