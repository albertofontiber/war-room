import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { TareaCreateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import type { TareaTipo } from "@/types";
import { sendFinderTaskAssignedEmail } from "@/lib/email-finder-assignment";

export const dynamic = "force-dynamic";

/**
 * GET /api/empresas/[id]/tareas?incluirCompletadas=true|false
 * Listado de tareas de la empresa. Por defecto oculta las completadas,
 * que se devuelven al final si se pide incluirCompletadas=true.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const incluirCompletadas =
      new URL(req.url).searchParams.get("incluirCompletadas") === "true";

    const tareas = await prisma.tarea.findMany({
      where: {
        empresaId,
        ...(incluirCompletadas ? {} : { completada: false }),
      },
      include: {
        autor: { select: { id: true, name: true } },
        autorFinder: { select: { id: true, name: true } },
        asignado: { select: { id: true, name: true } },
        asignadoFinder: { select: { id: true, name: true } },
      },
      orderBy: [
        { completada: "asc" },
        { fechaLimite: "asc" },
        { createdAt: "desc" },
      ],
    });
    return NextResponse.json(tareas);
  } catch (err) {
    log.error("api/empresas/[id]/tareas GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/empresas/[id]/tareas
 * Body: { titulo, descripcion?, fechaLimite?, asignadoId? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const parsed = TareaCreateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);
    const { tipo, titulo, descripcion, fechaLimite, asignadoId, asignadoFinderId, completada, resultado } = parsed.data;

    // Mutex: solo uno de los dos asignados activos. Si pasan ambos en el
    // body (no debería desde la UI), prioridad al finder (asumimos intent).
    const finalAsignadoFinderId = asignadoFinderId || null;
    const finalAsignadoId = finalAsignadoFinderId ? null : asignadoId || null;

    const isCompletada = completada === true;
    const tarea = await prisma.tarea.create({
      data: {
        empresaId,
        tipo: (tipo ?? "otra") as TareaTipo,
        titulo,
        descripcion: descripcion?.trim() || null,
        resultado: resultado?.trim() || null,
        fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
        completada: isCompletada,
        completadaAt: isCompletada ? new Date() : null,
        asignadoId: finalAsignadoId,
        asignadoFinderId: finalAsignadoFinderId,
        autorId: user.id,
      },
      include: {
        autor: { select: { id: true, name: true } },
        autorFinder: { select: { id: true, name: true } },
        asignado: { select: { id: true, name: true } },
        asignadoFinder: { select: { id: true, name: true, email: true } },
        empresa: { select: { id: true, nombre: true } },
      },
    });
    void auditLog({
      actorType: "admin",
      actorId: user.id,
      action: "create",
      entityType: "tarea",
      entityId: tarea.id,
      after: {
        empresaId,
        tipo: tarea.tipo,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion,
        resultado: tarea.resultado,
        fechaLimite: tarea.fechaLimite,
        completada: tarea.completada,
        asignadoId: tarea.asignadoId,
        asignadoFinderId: tarea.asignadoFinderId,
      },
    });

    // Email al finder asignado al crearse la tarea (solo si no está ya
    // completada — si es un registro histórico no tiene sentido notificar).
    if (tarea.asignadoFinder?.email && !isCompletada) {
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
        log.error("api/empresas/[id]/tareas POST email", err)
      );
    }

    return NextResponse.json(tarea, { status: 201 });
  } catch (err) {
    log.error("api/empresas/[id]/tareas POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
