import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { isValidTareaTipo } from "@/lib/crm";
import type { TareaTipo } from "@/types";

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
        asignado: { select: { id: true, name: true } },
      },
      orderBy: [
        { completada: "asc" },
        { fechaLimite: "asc" },
        { createdAt: "desc" },
      ],
    });
    return NextResponse.json(tareas);
  } catch (err) {
    console.error("[GET tareas]", err);
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

    const body = (await req.json()) as {
      tipo?: string;
      titulo?: string;
      descripcion?: string | null;
      fechaLimite?: string | null;
      asignadoId?: string | null;
    };

    if (!body.titulo?.trim()) {
      return NextResponse.json({ error: "Titulo required" }, { status: 400 });
    }

    const tipo: TareaTipo = isValidTareaTipo(body.tipo) ? body.tipo : "otra";

    const tarea = await prisma.tarea.create({
      data: {
        empresaId,
        tipo,
        titulo: body.titulo.trim(),
        descripcion: body.descripcion?.trim() || null,
        fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
        asignadoId: body.asignadoId || null,
        autorId: user.id,
      },
      include: {
        autor: { select: { id: true, name: true } },
        asignado: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(tarea, { status: 201 });
  } catch (err) {
    console.error("[POST tareas]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
