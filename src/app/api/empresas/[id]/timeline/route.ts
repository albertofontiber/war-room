/**
 * GET /api/empresas/[id]/timeline
 *
 * Devuelve el timeline unificado de una empresa para vista admin. Combina
 * notas, tareas completadas, cambios de stage y BORMEs en una sola lista
 * cronológica (desc). El cliente arma categorías/filtros/agrupación.
 *
 * También devuelve `lastSeenAt` (cursor del usuario actual) para que el
 * cliente pinte la línea "── N nuevas desde tu última visita ──".
 *
 * Sin paginación en MVP — un deal típico tiene 20-100 eventos. Si surge
 * necesidad, añadir cursor-based pagination por `fecha` desc.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { getEmpresaTimeline } from "@/lib/timeline";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const [events, seen] = await Promise.all([
      getEmpresaTimeline(empresaId, { scope: "admin", userId: user.id }),
      prisma.empresaSeenAt.findUnique({
        where: { empresaId_userId: { empresaId, userId: user.id } },
        select: { lastSeenAt: true },
      }),
    ]);

    return NextResponse.json({
      events,
      lastSeenAt: seen?.lastSeenAt?.toISOString() ?? null,
    });
  } catch (err) {
    log.error("api/empresas/[id]/timeline GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
