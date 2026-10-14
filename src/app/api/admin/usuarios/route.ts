import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdminUserCreateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import {
  ADMIN_USER_SELECT,
  getRequestingAdmin,
  withPendingInvitation,
} from "@/lib/admin-users";
import {
  INVITATION_WINDOW_MS,
  issueAdminPasswordLink,
} from "@/lib/admin-password-link";
import { sendAdminInvitationEmail } from "@/lib/email-password-reset";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/usuarios
 * Usuarios del war room (activos e inactivos) para la pantalla /usuarios.
 */
export async function GET() {
  const me = await getRequestingAdmin();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { role: "admin" },
    select: ADMIN_USER_SELECT,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const rows = await withPendingInvitation(users);
  return NextResponse.json(rows.map((u) => ({ ...u, isMe: u.id === me.id })));
}

/**
 * POST /api/admin/usuarios
 * Da de alta a un usuario del war room y le envía la invitación por email.
 * No lleva contraseña: la elige el invitado desde el enlace (7 días). La
 * respuesta incluye el enlace para poder pasárselo a mano si el email no llega.
 */
export async function POST(req: NextRequest) {
  const me = await getRequestingAdmin();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = AdminUserCreateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const { email, name } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, active: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: existing.active
          ? "Ya existe un usuario con ese email"
          : "Ese email ya existe pero está desactivado: reactívalo desde la lista",
      },
      { status: 409 }
    );
  }

  try {
    const user = await prisma.user.create({
      data: { email, name: name.trim(), role: "admin", active: true },
      select: ADMIN_USER_SELECT,
    });
    const { url, expiresAt } = await issueAdminPasswordLink(
      user.id,
      INVITATION_WINDOW_MS
    );
    // Esperamos a Resend: en Vercel el trabajo tras la respuesta se puede cortar.
    const emailSent = await sendAdminInvitationEmail({
      to: user.email,
      adminName: user.name,
      invitedBy: me.name,
      link: url,
      expiresAt,
    });

    log.info("api/admin/usuarios POST", "created", { id: user.id, email: user.email });
    void auditLog({
      actorType: "admin",
      actorId: me.id,
      action: "create",
      entityType: "user",
      entityId: user.id,
      after: { email: user.email, name: user.name, role: "admin" },
      metadata: { event: "admin_invited", emailSent },
    });

    return NextResponse.json(
      {
        user: { ...user, invitationExpiresAt: expiresAt, isMe: false },
        inviteUrl: url,
        emailSent,
      },
      { status: 201 }
    );
  } catch (err) {
    log.error("api/admin/usuarios POST", err);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
