import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { logFinderAction } from "@/lib/finder-access-log";
import { PortalActividadCreateSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/empresas/:id/actividades — registra una actividad (nota /
 * llamada / email / reunión) sobre un target del finder. `autorFinderId` =
 * finder.id. `fecha` opcional (default: ahora).
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

  const parsed = PortalActividadCreateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const empresa = await prisma.empresa.findFirst({
    where: { id, finderSourceId: finder.id, esAnonima: false },
    select: { id: true },
  });
  if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actividad = await prisma.actividad.create({
    data: {
      empresaId: id,
      tipo: body.tipo,
      texto: body.texto ?? null,
      autorFinderId: finder.id,
      fecha: body.fecha ? new Date(body.fecha) : new Date(),
    },
    select: {
      id: true,
      tipo: true,
      texto: true,
      fecha: true,
      autorFinder: { select: { name: true } },
    },
  });
  await logFinderAction({
    finderId: finder.id,
    action: "add_activity",
    resourceId: String(actividad.id),
  });

  return NextResponse.json(actividad, { status: 201 });
}
