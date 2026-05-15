import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

// Sin `force-dynamic` para permitir cache HTTP. Lista de grupos cambia
// raramente (solo al crear/asignar grupo desde un panel) — 60s de cache
// + SWR de 1h reduce mucho la latencia del PanelEmpresa al abrir.

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
    // Sin Cache-Control: los grupos se crean/editan desde la UI; la cache
    // HTTP escondería altas recientes. Invalidación por bus `wr:data-changed`.
    return NextResponse.json(grupos);
  } catch (error) {
    log.error("api/grupos GET", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
