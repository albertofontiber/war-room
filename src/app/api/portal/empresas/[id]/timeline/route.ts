/**
 * GET /api/portal/empresas/[id]/timeline
 *
 * Espejo portal del endpoint timeline. Diferencias clave:
 *   - Verifica que el target esté asignado al finder (`finderSourceId`), 404 si no.
 *   - El unifier filtra notas internas de admin (visibleAFinder=false).
 *   - El cursor `lastSeenAt` se busca por `finderId`, no por `userId`.
 *
 * Tareas, cambios de stage y BORMEs se devuelven sin filtrado adicional —
 * el portal ya muestra esos datos en otras secciones, no hay leak nuevo.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { getEmpresaTimeline } from "@/lib/timeline";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const empresaId = parseInt(params.id, 10);
  if (isNaN(empresaId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    // Verificar acceso: empresa debe estar asignada a este finder.
    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, finderSourceId: finder.id, esAnonima: false },
      select: { id: true },
    });
    if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [events, seen] = await Promise.all([
      getEmpresaTimeline(empresaId, { scope: "portal", finderId: finder.id }),
      prisma.empresaSeenAt.findUnique({
        where: { empresaId_finderId: { empresaId, finderId: finder.id } },
        select: { lastSeenAt: true },
      }),
    ]);

    return NextResponse.json({
      events,
      lastSeenAt: seen?.lastSeenAt?.toISOString() ?? null,
    });
  } catch (err) {
    log.error("api/portal/empresas/[id]/timeline GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
