import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { TareaCreateSchema, zodError } from "@/lib/validation";
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

    const parsed = TareaCreateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);
    const { tipo, titulo, descripcion, fechaLimite, asignadoId } = parsed.data;

    const tarea = await prisma.tarea.create({
      data: {
        empresaId,
        tipo: (tipo ?? "otra") as TareaTipo,
        titulo,
        descripcion: descripcion?.trim() || null,
        fechaLimite: fechaLimite ? new Date(fechaLimite) : null,
        asignadoId: asignadoId || null,
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
