import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/finders/:id/revoke-sessions — cierra todas las sesiones vivas.
 *
 * Sube `Finder.sessionVersion` en 1. Cualquier JWT emitido antes deja de validar
 * en `getCurrentFinder()` (el `sessionVersion` embebido en el token ya no
 * coincide con el de BD), así que el finder es expulsado del portal en su
 * próxima petición/navegación aunque conserve la cookie de sesión.
 *
 * No desactiva al finder: sigue pudiendo volver a iniciar sesión con su
 * password. Para bloquear también el login, usar el toggle "activo" (PATCH).
 *
 * Solo admins.
 */
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const finder = await prisma.finder.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, sessionVersion: true },
  });
  if (!finder) {
    return NextResponse.json({ error: "Finder not found" }, { status: 404 });
  }

  let updated: { sessionVersion: number };
  try {
    updated = await prisma.finder.update({
      where: { id: params.id },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
  } catch (err) {
    log.error("api/finders/[id]/revoke-sessions POST", err, {
      finderId: params.id,
    });
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }

  log.info("api/finders/[id]/revoke-sessions POST", "sessions revoked", {
    finderId: params.id,
    email: finder.email,
    sessionVersion: updated.sessionVersion,
  });

  const user = await getCurrentUser();
  void auditLog({
    actorType: "admin",
    actorId: user?.id ?? null,
    action: "update",
    entityType: "finder",
    entityId: params.id,
    before: { sessionVersion: finder.sessionVersion },
    after: { sessionVersion: updated.sessionVersion },
    metadata: { event: "sessions_revoked" },
  });

  return NextResponse.json({ ok: true, sessionVersion: updated.sessionVersion });
}
