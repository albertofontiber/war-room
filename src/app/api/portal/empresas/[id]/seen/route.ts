/**
 * POST /api/portal/empresas/[id]/seen — espejo finder del cursor leído.
 * Verifica que la empresa esté asignada al finder antes de upsert.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, finderSourceId: finder.id, esAnonima: false },
      select: { id: true },
    });
    if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const lastSeenAt = typeof body?.lastSeenAt === "string"
      ? new Date(body.lastSeenAt)
      : new Date();
    if (isNaN(lastSeenAt.getTime())) {
      return NextResponse.json({ error: "lastSeenAt inválido" }, { status: 400 });
    }

    await prisma.empresaSeenAt.upsert({
      where: { empresaId_finderId: { empresaId, finderId: finder.id } },
      create: { empresaId, finderId: finder.id, lastSeenAt },
      update: { lastSeenAt },
    });

    return NextResponse.json({ ok: true, lastSeenAt: lastSeenAt.toISOString() });
  } catch (err) {
    log.error("api/portal/empresas/[id]/seen POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
