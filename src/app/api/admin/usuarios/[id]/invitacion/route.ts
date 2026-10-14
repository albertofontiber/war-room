import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import { getRequestingAdmin } from "@/lib/admin-users";
import {
  INVITATION_WINDOW_MS,
  issueAdminPasswordLink,
} from "@/lib/admin-password-link";
import { sendAdminInvitationEmail } from "@/lib/email-password-reset";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/usuarios/:id/invitacion
 *
 * Genera un enlace nuevo para que el usuario fije su contraseña y se lo envía
 * por email. Anula los anteriores. Sirve para una invitación caducada o
 * perdida, y también para quien ya tenía contraseña y la ha olvidado.
 */
export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const me = await getRequestingAdmin();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }
  if (!user.active) {
    return NextResponse.json(
      { error: "El usuario está desactivado: reactívalo antes de enviarle un enlace" },
      { status: 400 }
    );
  }

  try {
    const { url, expiresAt } = await issueAdminPasswordLink(
      user.id,
      INVITATION_WINDOW_MS
    );
    const emailSent = await sendAdminInvitationEmail({
      to: user.email,
      adminName: user.name,
      invitedBy: me.name,
      link: url,
      expiresAt,
    });
    void auditLog({
      actorType: "admin",
      actorId: me.id,
      action: "update",
      entityType: "user",
      entityId: user.id,
      metadata: { event: "admin_invitation_resent", emailSent },
    });
    return NextResponse.json({ inviteUrl: url, expiresAt, emailSent });
  } catch (err) {
    log.error("api/admin/usuarios/[id]/invitacion POST", err);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
