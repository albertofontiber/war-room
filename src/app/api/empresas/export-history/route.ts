import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmpresaHistoryExportSchema, zodError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Devuelve el histórico desde 2020 únicamente para las empresas visibles que
 * el cliente incluye en `empresaIds`. Se consulta solo al pulsar exportar: la
 * carga habitual de Tabla continúa trayendo únicamente los dos últimos años.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = EmpresaHistoryExportSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const empresaIds = [...new Set(parsed.data.empresaIds)];
  if (empresaIds.length === 0) {
    return NextResponse.json({ records: [] });
  }

  try {
    const records = await prisma.financiero.findMany({
      where: {
        empresaId: { in: empresaIds },
        anio: { gte: 2020 },
      },
      select: {
        empresaId: true,
        anio: true,
        ingresos: true,
        margenBruto: true,
        ebitda: true,
      },
      orderBy: [{ empresaId: "asc" }, { anio: "asc" }],
    });

    return NextResponse.json({ records });
  } catch (error) {
    log.error("api/empresas/export-history POST", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
