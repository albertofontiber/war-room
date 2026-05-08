import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { TareaUpdateSchema, zodError } from "@/lib/validation";
import { auditLog, diffFields } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import type { TareaTipo } from "@/types";
import { sendFinderTaskAssignedEmail } from "@/lib/email-finder-assignment";

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
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
    // Mutex admin/finder: si se asigna a finder, limpiamos asignadoId y vv.
    // Solo si el caller pasa explícitamente uno de los dos.
    if (body.asignadoFinderId !== undefined) {
      data.asignadoFinderId = body.asignadoFinderId || null;
      if (body.asignadoFinderId) data.asignadoId = null;
    }
    if (body.asignadoId !== undefined) {
      data.asignadoId = body.asignadoId || null;
      if (body.asignadoId) data.asignadoFinderId = null;
    }
    if (body.completada !== undefined) {
      data.completada = body.completada;
      data.completadaAt = body.completada ? new Date() : null;
    }

    const prev = await prisma.tarea.findUnique({
      where: { id: tareaId },
      select: {
        tipo: true, titulo: true, descripcion: true, resultado: true,
        fechaLimite: true, completada: true,
        asignadoId: true, asignadoFinderId: true,
      },
    });
    const tarea = await prisma.tarea.update({
      where: { id: tareaId },
      data,
      include: {
        autor: { select: { id: true, name: true } },
        asignado: { select: { id: true, name: true } },
        asignadoFinder: { select: { id: true, name: true, email: true } },
        empresa: { select: { id: true, nombre: true } },
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
        asignadoFinderId: tarea.asignadoFinderId,
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

      // Email si el finder asignado cambió a alguien nuevo (no desasignar).
      const finderAsignadoCambio =
        prev.asignadoFinderId !== tarea.asignadoFinderId &&
        tarea.asignadoFinderId !== null;
      if (finderAsignadoCambio && tarea.asignadoFinder?.email && !tarea.completada) {
        void sendFinderTaskAssignedEmail({
          to: tarea.asignadoFinder.email,
          finderName: tarea.asignadoFinder.name,
          empresaId: tarea.empresa.id,
          empresaNombre: tarea.empresa.nombre,
          tareaTitulo: tarea.titulo,
          tareaDescripcion: tarea.descripcion,
          tareaFechaLimite: tarea.fechaLimite,
          asignadoPor: user.name ?? "Un admin",
        }).catch((err) =>
          log.error("api/tareas/[id] PATCH email", err)
        );
      }
    }
    return NextResponse.json(tarea);
  } catch (err) {
    log.error("api/tareas/[id] PATCH", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
    log.error("api/tareas/[id] DELETE", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
