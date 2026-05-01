import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { logFinderAction } from "@/lib/finder-access-log";
import { notifyAdmins } from "@/lib/notifications";
import { auditLog } from "@/lib/audit-log";
import { TAREA_TIPO_LABEL } from "@/lib/crm";
import type { TareaTipo } from "@/types";
import { PortalTareaCreateSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/empresas/:id/tareas — crea una tarea que el finder se
 * autoasigna. `autorFinderId = asignadoFinderId = finder.id`. Solo si el
 * target está asignado a él (finderSourceId), 404 en otro caso.
 *
 * Tras la unificación Tarea+Actividad, el finder puede crear desde dos formularios:
 *   - "Pendiente" → completada=false (por defecto). Sin resultado.
 *   - "Ya hecho"  → completada=true + resultado opcional. La fecha puede ser pasada.
 *
 * Notifica a los admins por campanita in-app (sin email — el digest diario
 * agrupa estas acciones).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = PortalTareaCreateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const empresa = await prisma.empresa.findFirst({
    where: { id, finderSourceId: finder.id, esAnonima: false },
    select: { id: true, nombre: true },
  });
  if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const completada = body.completada === true;

  const tarea = await prisma.tarea.create({
    data: {
      empresaId: id,
      tipo: body.tipo ?? "otra",
      titulo: body.titulo,
      descripcion: body.descripcion ?? null,
      resultado: body.resultado ?? null,
      fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
      completada,
      completadaAt: completada ? new Date() : null,
      autorFinderId: finder.id,
      asignadoFinderId: finder.id,
    },
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descripcion: true,
      resultado: true,
      fechaLimite: true,
      completada: true,
      completadaAt: true,
      createdAt: true,
      autorFinder: { select: { name: true } },
    },
  });
  await logFinderAction({
    finderId: finder.id,
    action: "add_task",
    resourceId: String(tarea.id),
  });

  void auditLog({
    actorType: "finder",
    actorId: finder.id,
    action: "create",
    entityType: "tarea",
    entityId: tarea.id,
    after: {
      empresaId: id,
      tipo: tarea.tipo,
      titulo: tarea.titulo,
      descripcion: tarea.descripcion,
      resultado: tarea.resultado,
      fechaLimite: tarea.fechaLimite,
      completada: tarea.completada,
    },
  });

  // Campanita in-app a admins (sin email — irá en el digest diario).
  const tipoLabel = TAREA_TIPO_LABEL[(tarea.tipo as TareaTipo)] ?? tarea.tipo;
  await notifyAdmins({
    tipo: completada ? "task_logged" : "task_added",
    titulo: completada
      ? `${finder.name}: registrada actividad en ${empresa.nombre}`
      : `${finder.name}: nueva tarea en ${empresa.nombre}`,
    mensaje: `${tipoLabel} — ${tarea.titulo}`,
    link: `/?empresa=${empresa.id}`,
    email: false,
  }).catch((err) => console.error("[portal/tareas POST] notifyAdmins error:", err));

  return NextResponse.json(tarea, { status: 201 });
}
