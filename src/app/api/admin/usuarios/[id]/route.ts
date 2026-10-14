import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdminUserUpdateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import { ADMIN_USER_SELECT, getRequestingAdmin } from "@/lib/admin-users";
import { revokeAdminPasswordLinks } from "@/lib/admin-password-link";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/usuarios/:id  { active }
 *
 * Desactiva o reactiva a un usuario del war room. Desactivar corta el acceso
 * en caliente (la sesión se revalida contra la BD en cada petición) y anula
 * sus enlaces pendientes. Reactivar le devuelve el acceso con la contraseña
 * que ya tenía. Sus notas, tareas e historial se conservan siempre.
 *
 * Nadie puede desactivarse a sí mismo, para no dejar el war room sin nadie
 * dentro por un clic.
 */
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const me = await getRequestingAdmin();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = AdminUserUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const { active } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, active: true },
  });
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }
  if (!active && user.id === me.id) {
    return NextResponse.json(
      { error: "No puedes desactivar tu propio usuario" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { active },
      select: ADMIN_USER_SELECT,
    });
    if (!active) await revokeAdminPasswordLinks(user.id);

    log.info(
      "api/admin/usuarios/[id] PATCH",
      active ? "activated" : "deactivated",
      { id: user.id }
    );
    void auditLog({
      actorType: "admin",
      actorId: me.id,
      action: "update",
      entityType: "user",
      entityId: user.id,
      before: { active: user.active },
      after: { active },
    });
    return NextResponse.json({ ...updated, invitationExpiresAt: null, isMe: false });
  } catch (err) {
    log.error("api/admin/usuarios/[id] PATCH", err);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
