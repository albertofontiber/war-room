import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Solo admins. Lista todos los grupos del sistema (datos confidenciales:
    // identifica empresas relacionadas, holdings, M&A en curso).
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const grupos = await prisma.grupo.findMany({
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    return NextResponse.json(grupos);
  } catch (error) {
    console.error("GET /api/grupos", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
