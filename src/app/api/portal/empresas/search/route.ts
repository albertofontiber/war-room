import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/empresas/search?q={query}
 *
 * Autocomplete para el formulario de "Proponer target" del portal. Solo
 * devuelve `nombre` y `cif` para permitir al finder verificar duplicados
 * SIN revelar el estado del target (stage, owner, grupo, perímetro, etc.).
 *
 * Excluye leads anónimos (`esAnonima=true`). Requiere sesión finder.
 */
export async function GET(req: NextRequest) {
  try {
    await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  // Excluye los CIF de leads placeholder ("LEAD-123") aunque esAnonima ya filtra
  const results = await prisma.empresa.findMany({
    where: {
      esAnonima: false,
      OR: [
        { nombre: { contains: q, mode: "insensitive" } },
        { cif: { contains: q.toUpperCase(), mode: "insensitive" } },
      ],
    },
    select: { nombre: true, cif: true },
    take: 10,
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(results);
}
