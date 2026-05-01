import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/crm/pipeline-meta
 *
 * Devuelve las opciones únicas para los selectores de filtros del Kanban:
 * CCAAs, provincias y owners activos. Siempre sobre el conjunto en perímetro
 * (independiente de los filtros aplicados por el usuario).
 *
 * Cache HTTP: las CCAAs/provincias del universo cambian raramente y los
 * owners/finders aún más. 5 min de cache + 1h SWR es seguro.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [empresas, users, finders] = await Promise.all([
      prisma.empresa.findMany({
        where: { enPerimetro: true },
        select: { ccaa: true, provincia: true },
      }),
      prisma.user.findMany({
        where: { active: true, role: "admin" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.finder.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const ccaaSet = new Set<string>();
    const provinciaSet = new Set<string>();
    for (const e of empresas) {
      if (e.ccaa) ccaaSet.add(e.ccaa);
      if (e.provincia) provinciaSet.add(e.provincia);
    }

    return NextResponse.json(
      {
        ccaa: Array.from(ccaaSet).sort(),
        provincia: Array.from(provinciaSet).sort(),
        owners: users.map((u) => ({ value: u.id, label: u.name })),
        finders: finders.map((f) => ({ value: f.id, label: f.name })),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch (err) {
    console.error("[GET pipeline-meta]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
