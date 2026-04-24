import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/finders
 * Lista de finders activos. Usado para el selector de "asignar a finder" en la ficha
 * de empresa. También lo consumirá en el futuro `/admin/finders` cuando se cree.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const finders = await prisma.finder.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        commissionPct: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(finders);
  } catch (err) {
    console.error("[GET /api/finders]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
