import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/empresas/search?q={query}&excludeId={n}
 *
 * Autocompleta empresas REALES (esAnonima=false) por nombre o CIF.
 * Usado por el modal de vincular lead anónimo a empresa real.
 * Devuelve hasta 10 resultados.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const excludeIdParam = req.nextUrl.searchParams.get("excludeId");
  const excludeId = excludeIdParam ? parseInt(excludeIdParam, 10) : null;

  if (q.length < 2) return NextResponse.json([]);

  const results = await prisma.empresa.findMany({
    where: {
      esAnonima: false,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { nombre: { contains: q, mode: "insensitive" } },
        { cif: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      nombre: true,
      cif: true,
      provincia: true,
      ccaa: true,
      sector: true,
      crmEstado: { select: { dealStage: true } },
    },
    take: 10,
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(results);
}
