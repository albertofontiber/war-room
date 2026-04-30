import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { notifyAdmins } from "@/lib/notifications";
import { TAREA_TIPO_LABEL } from "@/lib/crm";
import type { TareaTipo } from "@/types";
import { PortalTareaUpdateSchema, zodError } from "@/lib/validation";

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
      console.error("[portal/tareas PATCH] notifyAdmins error:", err)
    );
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
    select: { id: true, completada: true },
  });
  if (!tarea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tarea.completada) {
    return NextResponse.json(
      { error: "No se puede borrar una tarea completada — descomplétala primero." },
      { status: 403 }
    );
  }

  await prisma.tarea.delete({ where: { id: tareaId } });
  return NextResponse.json({ ok: true });
}
