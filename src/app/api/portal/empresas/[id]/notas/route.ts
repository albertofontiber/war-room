import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { logFinderAction } from "@/lib/finder-access-log";
import { PortalNotaCreateSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/empresas/:id/notas — crea una nota del finder sobre un
 * target suyo. El autor se infiere de la sesión (autorFinderId = finder.id).
 * Devuelve 404 si la empresa no está asignada a este finder (sin leak).
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

  const parsed = PortalNotaCreateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const empresa = await prisma.empresa.findFirst({
    where: { id, finderSourceId: finder.id, esAnonima: false },
    select: { id: true },
  });
  if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nota = await prisma.nota.create({
    data: {
      empresaId: id,
      autorFinderId: finder.id,
      contenido: parsed.data.contenido,
      // visibleAFinder es irrelevante aquí (las notas del finder siempre las ve el
      // propio finder y los admins las leen sin restricción). Dejamos default false.
    },
    select: {
      id: true,
      contenido: true,
      createdAt: true,
      autorFinder: { select: { name: true } },
    },
  });

  await logFinderAction({
    finderId: finder.id,
    action: "add_note",
    resourceId: String(nota.id),
  });

  return NextResponse.json(nota, { status: 201 });
}
