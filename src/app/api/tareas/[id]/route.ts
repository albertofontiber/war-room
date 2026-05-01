import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { TareaUpdateSchema, zodError } from "@/lib/validation";
import { auditLog, diffFields } from "@/lib/audit-log";
import type { TareaTipo } from "@/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/tareas/[id]
 * Body parcial: { titulo?, descripcion?, fechaLimite?, asignadoId?, completada? }
 * Si `completada` pasa a true, marca `completadaAt = ahora`.
 * Si pasa a false, limpia `completadaAt`.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tareaId = Number(params.id);
    if (!Number.isFinite(tareaId)) {
      return NextResponse.json({ error: "Invalid tarea id" }, { status: 400 });
    }

    const parsed = TareaUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;

    const data: Record<string, unknown> = {};
    if (body.tipo !== undefined) data.tipo = body.tipo as TareaTipo;
    if (body.titulo !== undefined) data.titulo = body.titulo;
    if (body.descripcion !== undefined) data.descripcion = body.descripcion?.trim() || null;
    if (body.resultado !== undefined) data.resultado = body.resultado?.trim() || null;
    if (body.fechaLimite !== undefined)
      data.fechaLimite = body.fechaLimite ? new Date(body.fechaLimite) : null;
    if (body.asignadoId !== undefined) data.asignadoId = body.asignadoId || null;
    if (body.completada !== undefined) {
      data.completada = body.completada;
      data.completadaAt = body.completada ? new Date() : null;
    }

    const prev = await prisma.tarea.findUnique({
      where: { id: tareaId },
      select: {
        tipo: true, titulo: true, descripcion: true, resultado: true,
        fechaLimite: true, completada: true, asignadoId: true,
      },
    });
    const tarea = await prisma.tarea.update({
      where: { id: tareaId },
      data,
      include: {
        autor: { select: { id: true, name: true } },
        asignado: { select: { id: true, name: true } },
      },
    });
    if (prev) {
      const diff = diffFields(prev, {
        tipo: tarea.tipo,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion,
        resultado: tarea.resultado,
        fechaLimite: tarea.fechaLimite,
        completada: tarea.completada,
        asignadoId: tarea.asignadoId,
      });
      if (Object.keys(diff.after).length > 0) {
        void auditLog({
          actorType: "admin",
          actorId: user.id,
          action: "update",
          entityType: "tarea",
          entityId: tareaId,
          before: diff.before,
          after: diff.after,
        });
      }
    }
    return NextResponse.json(tarea);
  } catch (err) {
    console.error("[PATCH tarea]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tareaId = Number(params.id);
    if (!Number.isFinite(tareaId)) {
      return NextResponse.json({ error: "Invalid tarea id" }, { status: 400 });
    }

    const prev = await prisma.tarea.findUnique({
      where: { id: tareaId },
      select: {
        tipo: true, titulo: true, descripcion: true, resultado: true,
        fechaLimite: true, completada: true, empresaId: true,
      },
    });
    await prisma.tarea.delete({ where: { id: tareaId } });
    if (prev) {
      void auditLog({
        actorType: "admin",
        actorId: user.id,
        action: "delete",
        entityType: "tarea",
        entityId: tareaId,
        before: prev,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE tarea]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
