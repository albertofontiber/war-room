import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder, canEditWithin24h } from "@/lib/finder-session";
import { PortalActividadUpdateSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function loadOwnActividad(
  finderId: string,
  rawId: string
): Promise<{ actividadId: number } | { error: string; status: number }> {
  const actividadId = parseInt(rawId, 10);
  if (isNaN(actividadId)) return { error: "Invalid id", status: 400 };

  const actividad = await prisma.actividad.findFirst({
    where: { id: actividadId, autorFinderId: finderId },
    select: { id: true, sincronizadoAt: true },
  });
  if (!actividad) return { error: "Not found", status: 404 };
  if (!canEditWithin24h(actividad.sincronizadoAt)) {
    return { error: "Edit window (24h) expired.", status: 403 };
  }
  return { actividadId: actividad.id };
}

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

  const parsed = PortalActividadUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const res = await loadOwnActividad(finder.id, params.id);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });

  const updated = await prisma.actividad.update({
    where: { id: res.actividadId },
    data: {
      ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
      ...(body.texto !== undefined ? { texto: body.texto } : {}),
      ...(body.fecha !== undefined ? { fecha: new Date(body.fecha) } : {}),
    },
    select: {
      id: true,
      tipo: true,
      texto: true,
      fecha: true,
      autorFinder: { select: { name: true } },
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

  const res = await loadOwnActividad(finder.id, params.id);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });

  await prisma.actividad.delete({ where: { id: res.actividadId } });
  return NextResponse.json({ ok: true });
}
