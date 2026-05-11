/**
 * GET /api/portal/menciones/candidatos?empresaId=123
 *
 * Versión del endpoint de candidatos para el portal del finder. Visibilidad:
 *   - Todos los admins activos.
 *   - El propio finder (puede mencionarse a sí mismo en una nota propia).
 *
 * Decisión Alberto 2026-05-11: los finders NO ven a OTROS finders. Aunque
 * hoy un deal solo tiene un finder, esto blinda contra futuras N:M y evita
 * exponer la lista de finders del programa.
 *
 * Verifica que la empresa esté asignada al finder (mismo guard que
 * /api/portal/empresas/[id]). Si no, 404 sin leak.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const empresaIdRaw = req.nextUrl.searchParams.get("empresaId");
    const empresaId = empresaIdRaw ? Number(empresaIdRaw) : null;
    if (!empresaId || !Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresaId" }, { status: 400 });
    }

    // Verificar acceso: la empresa debe estar asignada a ESTE finder.
    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, finderSourceId: finder.id, esAnonima: false },
      select: { id: true },
    });
    if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const admins = await prisma.user.findMany({
      where: { role: "admin", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    type Candidato = { kind: "u" | "f"; id: string; name: string };
    const result: Candidato[] = [
      ...admins.map<Candidato>((a) => ({ kind: "u", id: a.id, name: a.name })),
      { kind: "f", id: finder.id, name: finder.name },
    ];

    return NextResponse.json(result);
  } catch (err) {
    log.error("api/portal/menciones/candidatos GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
