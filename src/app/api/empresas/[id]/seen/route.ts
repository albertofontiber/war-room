/**
 * POST /api/empresas/[id]/seen
 *
 * Marca el timeline de la empresa como "leído hasta ahora" para el admin
 * actual. El cliente lo llama al cerrar el panel (o explícitamente).
 *
 * Body opcional `{ lastSeenAt?: string }` — si se pasa, se usa esa fecha;
 * por defecto, `new Date()`. Permitir override facilita "marcar como leído
 * hasta el evento X" en el futuro (no usado en MVP).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const lastSeenAt = typeof body?.lastSeenAt === "string"
      ? new Date(body.lastSeenAt)
      : new Date();
    if (isNaN(lastSeenAt.getTime())) {
      return NextResponse.json({ error: "lastSeenAt inválido" }, { status: 400 });
    }

    await prisma.empresaSeenAt.upsert({
      where: { empresaId_userId: { empresaId, userId: user.id } },
      create: { empresaId, userId: user.id, lastSeenAt },
      update: { lastSeenAt },
    });

    return NextResponse.json({ ok: true, lastSeenAt: lastSeenAt.toISOString() });
  } catch (err) {
    log.error("api/empresas/[id]/seen POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
