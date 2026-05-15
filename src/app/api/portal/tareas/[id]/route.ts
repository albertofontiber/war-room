import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { notifyAdmins } from "@/lib/notifications";
import { auditLog, diffFields } from "@/lib/audit-log";
import { TAREA_TIPO_LABEL } from "@/lib/crm";
import type { TareaTipo } from "@/types";
import { PortalTareaUpdateSchema, zodError } from "@/lib/validation";
import { processMenciones } from "@/lib/menciones-server";
import { logFinderAction } from "@/lib/finder-access-log";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/portal/tareas/:id — actualización tras la unificación Tarea+Actividad.
 *
 * Reglas de permisos (sin límite temporal de 24h):
 *   - Texto/fecha/tipo (titulo, descripcion, fechaLimite, tipo):
 *       solo el AUTOR finder y solo si la tarea NO está completada.
 *   - `resultado` (notas post-evento):
 *       el AUTOR finder puede editarlo siempre, incluso con completada=true.
 *       Es texto libre histórico — no cambia el estado de la tarea.
 *   - `completada` (toggle):
 *       el autor o el asignado finder. Setear true marca completadaAt = ahora;
 *       false lo limpia.
 *   - En otros casos → 404.
 *
 * DELETE: solo el autor finder y solo si la tarea NO está completada.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tareaId = parseInt(params.id, 10);
  if (isNaN(tareaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = PortalTareaUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const tarea = await prisma.tarea.findFirst({
    where: {
      id: tareaId,
      OR: [
        { autorFinderId: finder.id },
        { asignadoFinderId: finder.id },
      ],
    },
    select: {
      id: true,
      autorFinderId: true,
      asignadoFinderId: true,
      completada: true,
      resultado: true,
      empresa: { select: { id: true, nombre: true } },
      titulo: true,
      tipo: true,
    },
  });
  if (!tarea) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = tarea.autorFinderId === finder.id;

  // Validar permisos por campo
  const wantsTextEdit =
    body.titulo !== undefined ||
    body.descripcion !== undefined ||
    body.fechaLimite !== undefined ||
    body.tipo !== undefined;
  if (wantsTextEdit) {
    if (!isAuthor) {
      return NextResponse.json(
        { error: "Solo el autor de la tarea puede editar texto, fecha o tipo." },
        { status: 403 }
      );
    }
    if (tarea.completada) {
      return NextResponse.json(
        { error: "Tarea completada — descomplétala antes de editar texto/fecha/tipo." },
        { status: 403 }
      );
    }
  }

  if (body.resultado !== undefined && !isAuthor) {
    return NextResponse.json(
      { error: "Solo el autor puede editar el resultado." },
      { status: 403 }
    );
  }

  const isCompletingNow =
    body.completada === true && !tarea.completada;

  // Detecta cambio real del campo resultado para notificar (sin contar el caso
  // en que se manda junto con `completada=true` — ese ya genera "task_completed").
  const isEditingResultadoOnly =
    body.resultado !== undefined &&
    !isCompletingNow &&
    (body.resultado ?? null) !== (tarea.resultado ?? null);

  const updated = await prisma.tarea.update({
    where: { id: tareaId },
    data: {
      ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
      ...(body.titulo !== undefined ? { titulo: body.titulo } : {}),
      ...(body.descripcion !== undefined ? { descripcion: body.descripcion } : {}),
      ...(body.resultado !== undefined ? { resultado: body.resultado } : {}),
      ...(body.fechaLimite !== undefined
        ? { fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null }
        : {}),
      ...(body.completada !== undefined
        ? {
            completada: body.completada,
            completadaAt: body.completada ? new Date() : null,
          }
        : {}),
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
      autor: { select: { name: true } },
    },
  });

  // AuditLog del cambio (compara prev vs updated y registra solo campos cambiados).
  const diff = diffFields(
    {
      tipo: tarea.tipo,
      titulo: tarea.titulo,
      resultado: tarea.resultado,
      completada: tarea.completada,
    },
    {
      tipo: updated.tipo,
      titulo: updated.titulo,
      resultado: updated.resultado,
      completada: updated.completada,
    }
  );
  if (Object.keys(diff.after).length > 0) {
    void auditLog({
      actorType: "finder",
      actorId: finder.id,
      action: "update",
      entityType: "tarea",
      entityId: tareaId,
      before: diff.before,
      after: diff.after,
    });
    // FinderAccessLog: distinguir "completar" del resto de ediciones para que
    // luego se filtre fácil en el chat IA. complete_task gana sobre edit_task
    // cuando coinciden en la misma request.
    void logFinderAction({
      finderId: finder.id,
      action: isCompletingNow ? "complete_task" : "edit_task",
      resourceId: String(tareaId),
    });
  }

  // Campanita admin si el finder acaba de completar la tarea.
  if (isCompletingNow) {
    const tipoLabel = TAREA_TIPO_LABEL[updated.tipo as TareaTipo] ?? updated.tipo;
    await notifyAdmins({
      tipo: "task_completed",
      titulo: `${finder.name}: tarea completada en ${tarea.empresa.nombre}`,
      mensaje: `${tipoLabel} — ${updated.titulo}`,
      link: `/?empresa=${tarea.empresa.id}`,
      email: false,
    }).catch((err) =>
      log.error("api/portal/tareas/[id] PATCH notifyAdmins", err)
    );
  } else if (isEditingResultadoOnly) {
    // El finder editó/añadió las notas post-evento de una tarea (sin completarla
    // de nuevo). Manda una campanita propia con un preview del nuevo texto.
    const tipoLabel = TAREA_TIPO_LABEL[updated.tipo as TareaTipo] ?? updated.tipo;
    const nuevo = updated.resultado ?? "";
    const preview = nuevo
      ? (nuevo.length > 140 ? nuevo.slice(0, 140) + "…" : nuevo)
      : "(notas eliminadas)";
    await notifyAdmins({
      tipo: "task_resultado_edited",
      titulo: `${finder.name}: notas post-evento en ${tarea.empresa.nombre}`,
      mensaje: `${tipoLabel} — ${updated.titulo}\n\n${preview}`,
      link: `/?empresa=${tarea.empresa.id}`,
      email: false,
    }).catch((err) =>
      log.error("api/portal/tareas/[id] PATCH notifyAdmins", err)
    );
  }

  // Reprocesar menciones si tocaron campos de texto.
  const textChanged =
    body.titulo !== undefined ||
    body.descripcion !== undefined ||
    body.resultado !== undefined;
  if (textChanged) {
    void processMenciones({
      entity: { kind: "tarea", id: tareaId },
      empresaId: tarea.empresa.id,
      empresaNombre: tarea.empresa.nombre,
      contenido: [updated.titulo, updated.descripcion ?? "", updated.resultado ?? ""].join(" "),
      author: { kind: "f", id: finder.id, name: finder.name },
      adminLink: `/?empresa=${tarea.empresa.id}`,
      portalLink: `/portal/empresas/${tarea.empresa.id}`,
      context: "tarea",
    }).catch((err) => log.error("api/portal/tareas/[id] PATCH processMenciones", err));
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tareaId = parseInt(params.id, 10);
  if (isNaN(tareaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const tarea = await prisma.tarea.findFirst({
    where: { id: tareaId, autorFinderId: finder.id },
    select: {
      id: true, completada: true, tipo: true, titulo: true,
      descripcion: true, resultado: true, fechaLimite: true, empresaId: true,
    },
  });
  if (!tarea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tarea.completada) {
    return NextResponse.json(
      { error: "No se puede borrar una tarea completada — descomplétala primero." },
      { status: 403 }
    );
  }

  await prisma.tarea.delete({ where: { id: tareaId } });
  void logFinderAction({
    finderId: finder.id,
    action: "delete_task",
    resourceId: String(tareaId),
  });
  void auditLog({
    actorType: "finder",
    actorId: finder.id,
    action: "delete",
    entityType: "tarea",
    entityId: tareaId,
    before: {
      tipo: tarea.tipo, titulo: tarea.titulo, descripcion: tarea.descripcion,
      resultado: tarea.resultado, fechaLimite: tarea.fechaLimite,
      empresaId: tarea.empresaId,
    },
  });
  return NextResponse.json({ ok: true });
}
