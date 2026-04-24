import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/empresas/:id
 *
 * Ficha de un target para el finder autenticado. Solo responde 200 si
 * `finderSourceId === session.finderId`. En otro caso 404 (no leak de
 * existencia).
 *
 * Devuelve campos públicos para el finder: nombre, sector, provincia,
 * ccaa, web, linkedin, descripción, stage actual (read-only).
 *
 * Historial:
 *   - `Nota` creadas por el finder (siempre visibles)
 *   - `Nota` de admins con `visibleAFinder=true`
 *   - `Tarea` (propias del finder, autoasignadas o asignadas a él)
 *   - `Actividad` del finder
 *
 * NO incluye: CIF, financieros, grupo, owner interno, BORME, CrmLog,
 * notas internas de admins, ni nada privado.
 */
export async function GET(
  _req: Request,
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

  const empresa = await prisma.empresa.findFirst({
    where: {
      id,
      finderSourceId: finder.id,
      esAnonima: false,
    },
    select: {
      id: true,
      nombre: true,
      sector: true,
      provincia: true,
      ccaa: true,
      localidad: true,
      web: true,
      linkedin: true,
      descripcion: true,
      logoUrl: true,
      crmEstado: { select: { dealStage: true, fechaEntradaStage: true } },
    },
  });

  if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Notas: del finder (siempre) + de admins marcadas visibles
  const notas = await prisma.nota.findMany({
    where: {
      empresaId: id,
      OR: [
        { autorFinderId: finder.id },
        { visibleAFinder: true },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      contenido: true,
      createdAt: true,
      autor: { select: { name: true } },
      autorFinder: { select: { name: true } },
    },
  });

  // Tareas: autoasignadas/creadas por él o asignadas a él por admins
  const tareas = await prisma.tarea.findMany({
    where: {
      empresaId: id,
      OR: [
        { asignadoFinderId: finder.id },
        { autorFinderId: finder.id },
      ],
    },
    orderBy: [{ completada: "asc" }, { fechaLimite: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descripcion: true,
      fechaLimite: true,
      completada: true,
      completadaAt: true,
      createdAt: true,
      autor: { select: { name: true } },
      autorFinder: { select: { name: true } },
    },
  });

  // Actividades del finder
  const actividades = await prisma.actividad.findMany({
    where: { empresaId: id, autorFinderId: finder.id },
    orderBy: { fecha: "desc" },
    select: {
      id: true,
      tipo: true,
      texto: true,
      fecha: true,
      autorFinder: { select: { name: true } },
    },
  });

  return NextResponse.json({
    ...empresa,
    notas,
    tareas,
    actividades,
  });
}
