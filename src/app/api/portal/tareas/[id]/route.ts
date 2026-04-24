import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder, canEditWithin24h } from "@/lib/finder-session";
import { PortalTareaUpdateSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/portal/tareas/:id
 *   - Si el finder es el autor (autorFinderId) y creadas <24h → puede editar
 *     cualquier campo del schema.
 *   - Si el finder es solo el asignado (asignadoFinderId) → solo puede hacer
 *     toggle de `completada` (marcar como hecha o reabrir). No puede cambiar
 *     título, descripción ni fecha límite de una tarea que le asignó un admin.
 *   - En otros casos → 404 (no es accesible).
 *
 * DELETE solo permitido a finders autores dentro de la ventana 24h.
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
      createdAt: true,
      autorFinderId: true,
      asignadoFinderId: true,
      completada: true,
    },
  });
  if (!tarea) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = tarea.autorFinderId === finder.id;
  const withinWindow = canEditWithin24h(tarea.createdAt);

  // Validar permisos por campo
  const wantsTextEdit =
    body.titulo !== undefined ||
    body.descripcion !== undefined ||
    body.fechaLimite !== undefined ||
    body.tipo !== undefined;
  if (wantsTextEdit) {
    if (!isAuthor) {
      return NextResponse.json(
        { error: "Solo el autor de la tarea puede editarla." },
        { status: 403 }
      );
    }
    if (!withinWindow) {
      return NextResponse.json(
        { error: "Edit window (24h) expired. Crea una nueva tarea." },
        { status: 403 }
      );
    }
  }

  const updated = await prisma.tarea.update({
    where: { id: tareaId },
    data: {
      ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
      ...(body.titulo !== undefined ? { titulo: body.titulo } : {}),
      ...(body.descripcion !== undefined ? { descripcion: body.descripcion } : {}),
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
      fechaLimite: true,
      completada: true,
      completadaAt: true,
      createdAt: true,
      autorFinder: { select: { name: true } },
      autor: { select: { name: true } },
    },
  });
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
    select: { id: true, createdAt: true },
  });
  if (!tarea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditWithin24h(tarea.createdAt)) {
    return NextResponse.json(
      { error: "Delete window (24h) expired." },
      { status: 403 }
    );
  }

  await prisma.tarea.delete({ where: { id: tareaId } });
  return NextResponse.json({ ok: true });
}
