import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { logFinderAction } from "@/lib/finder-access-log";

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
 *   - `Tarea` (propias del finder, autoasignadas o asignadas a él) — modelo
 *     unificado: pendientes (completada=false) y registros históricos
 *     (completada=true, con `resultado` rellenado).
 *
 * NO incluye: CIF, financieros, grupo, owner interno, BORME, CrmLog,
 * notas internas de admins, ni nada privado.
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  // Notas: del finder (siempre) + de admins marcadas visibles. Las respuestas
  // (parentId != null) heredan visibilidad del root al crearse — si el finder
  // no debería ver la rama, las respuestas tendrán visibleAFinder=false y
  // quedan filtradas por el OR. Por seguridad, también filtramos a mano:
  // una respuesta solo aparece si el cliente además ve a su padre.
  // Order asc para que el cliente arme el árbol con padres antes que hijos.
  const notas = await prisma.nota.findMany({
    where: {
      empresaId: id,
      OR: [
        { autorFinderId: finder.id },
        { visibleAFinder: true },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      contenido: true,
      createdAt: true,
      parentId: true,
      autor: { select: { name: true } },
      autorFinder: { select: { name: true } },
    },
  });

  // Tareas: TODAS las del target (cambio 2026-05-08, antes solo las del
  // finder). El finder ve la actividad completa porque el target le está
  // asignado. Marca quién es asignado para distinguir "mías" vs "de admin".
  const tareas = await prisma.tarea.findMany({
    where: { empresaId: id },
    orderBy: [{ completada: "asc" }, { fechaLimite: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      tipo: true,
      titulo: true,
      descripcion: true,
      resultado: true,
      fechaLimite: true,
      completada: true,
      completadaAt: true,
      createdAt: true,
      autor: { select: { name: true } },
      autorFinder: { select: { name: true } },
      asignado: { select: { id: true, name: true } },
      asignadoFinder: { select: { id: true, name: true } },
    },
  });

  await logFinderAction({
    finderId: finder.id,
    action: "view_deal",
    resourceId: String(id),
  });

  return NextResponse.json({
    ...empresa,
    notas,
    tareas,
  });
}
