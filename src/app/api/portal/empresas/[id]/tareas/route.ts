import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { logFinderAction } from "@/lib/finder-access-log";
import { PortalTareaCreateSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/empresas/:id/tareas — crea una tarea que el finder se
 * autoasigna. `autorFinderId = asignadoFinderId = finder.id`. Solo si el
 * target está asignado a él (finderSourceId), 404 en otro caso.
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

  const empresa = await prisma.empresa.findFirst({
    where: { id, finderSourceId: finder.id, esAnonima: false },
    select: { id: true },
  });
  if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tarea = await prisma.tarea.create({
    data: {
      empresaId: id,
      tipo: parsed.data.tipo ?? "otra",
      titulo: parsed.data.titulo,
      descripcion: parsed.data.descripcion ?? null,
      fechaLimite: parsed.data.fechaLimite ? new Date(parsed.data.fechaLimite) : null,
      autorFinderId: finder.id,
      asignadoFinderId: finder.id,
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
    },
  });
  await logFinderAction({
    finderId: finder.id,
    action: "add_task",
    resourceId: String(tarea.id),
  });

  return NextResponse.json(tarea, { status: 201 });
}
