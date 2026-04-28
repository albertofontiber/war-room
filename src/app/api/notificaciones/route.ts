import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireCurrentUser } from "@/lib/user-from-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/notificaciones
 *
 * Devuelve las notificaciones del admin de la sesión.
 * Query params:
 *   - unreadOnly=1 → solo no leídas
 *   - limit (default 20, max 100)
 *
 * Respuesta: { items: Notificacion[], unreadCount: number }
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "1";
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = isNaN(limitRaw) ? 20 : Math.min(Math.max(limitRaw, 1), 100);

  const [items, unreadCount] = await Promise.all([
    prisma.notificacion.findMany({
      where: { userId: user.id, ...(unreadOnly ? { leida: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notificacion.count({ where: { userId: user.id, leida: false } }),
  ]);

  return NextResponse.json({ items, unreadCount });
}

/**
 * PATCH /api/notificaciones
 *
 * Marca como leídas. Body:
 *   - { ids: number[] }   → marca esas (solo si pertenecen al user)
 *   - { markAllRead: true } → marca todas las del user
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const now = new Date();

  if (body?.markAllRead === true) {
    const result = await prisma.notificacion.updateMany({
      where: { userId: user.id, leida: false },
      data: { leida: true, leidaAt: now },
    });
    return NextResponse.json({ updated: result.count });
  }

  if (Array.isArray(body?.ids) && body.ids.every((n: unknown) => typeof n === "number")) {
    const result = await prisma.notificacion.updateMany({
      where: { userId: user.id, id: { in: body.ids as number[] } },
      data: { leida: true, leidaAt: now },
    });
    return NextResponse.json({ updated: result.count });
  }

  return NextResponse.json(
    { error: "Body inválido: usa { ids: number[] } o { markAllRead: true }" },
    { status: 400 }
  );
}
