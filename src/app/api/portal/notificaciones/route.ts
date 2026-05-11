/**
 * GET /api/portal/notificaciones
 *
 * Espejo del endpoint admin pero para finders. Solo devuelve notificaciones
 * con `finderId === currentFinder.id`. El admin endpoint filtra por userId,
 * este por finderId — la tabla `Notificacion` es la misma con destinatario
 * mutex (uno u otro, nunca ambos).
 *
 * Tipos comunes para finders: "mencion", "nota_respuesta", "task_assigned"
 * (futuro). Cualquier `tipo` arbitrario se acepta — el filtro es por
 * destinatario, no por tipo.
 *
 * Query params idénticos a admin: `unreadOnly=1`, `limit` (default 20, max 100).
 *
 * PATCH para marcar leídas — body `{ ids: number[] }` o `{ markAllRead: true }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "1";
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = isNaN(limitRaw) ? 20 : Math.min(Math.max(limitRaw, 1), 100);

  const [items, unreadCount] = await Promise.all([
    prisma.notificacion.findMany({
      where: { finderId: finder.id, ...(unreadOnly ? { leida: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notificacion.count({ where: { finderId: finder.id, leida: false } }),
  ]);

  return NextResponse.json({ items, unreadCount });
}

export async function PATCH(req: NextRequest) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date();

  if (body?.markAllRead === true) {
    const result = await prisma.notificacion.updateMany({
      where: { finderId: finder.id, leida: false },
      data: { leida: true, leidaAt: now },
    });
    return NextResponse.json({ updated: result.count });
  }

  if (Array.isArray(body?.ids) && body.ids.every((n: unknown) => typeof n === "number")) {
    const result = await prisma.notificacion.updateMany({
      where: { finderId: finder.id, id: { in: body.ids as number[] } },
      data: { leida: true, leidaAt: now },
    });
    return NextResponse.json({ updated: result.count });
  }

  return NextResponse.json(
    { error: "Body inválido: usa { ids: number[] } o { markAllRead: true }" },
    { status: 400 }
  );
}
