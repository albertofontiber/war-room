import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { CuentaPasswordSchema, zodError } from "@/lib/validation";
import { adminPasswordMatches } from "@/lib/auth";
import { findAdminCredentialByEmail } from "@/lib/admin-credentials";
import { getRequestingAdmin } from "@/lib/admin-users";
import { revokeAdminPasswordLinks } from "@/lib/admin-password-link";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/cuenta/password  { currentPassword, newPassword }
 *
 * El usuario conectado cambia su contraseña desde Mi cuenta. Exige la actual
 * (la de BD o, para los dos admins originales, la de entorno si aún no tienen
 * una propia), guarda el hash nuevo y anula los enlaces de invitación o
 * recuperación que tuviera pendientes.
 */
export async function POST(req: NextRequest) {
  const me = await getRequestingAdmin();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CuentaPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = findAdminCredentialByEmail(user.email);
  const ok = await adminPasswordMatches(currentPassword, {
    password: config?.password,
    passwordHash: user.passwordHash ?? config?.passwordHash,
  });
  if (!ok) {
    log.warn("api/cuenta/password", "wrong_current_password", { userId: user.id });
    return NextResponse.json(
      { error: "La contraseña actual no es correcta" },
      { status: 400 }
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "La contraseña nueva tiene que ser distinta de la actual" },
      { status: 400 }
    );
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), passwordSetAt: now },
  });
  await revokeAdminPasswordLinks(user.id);

  void auditLog({
    actorType: "admin",
    actorId: user.id,
    action: "update",
    entityType: "user",
    entityId: user.id,
    after: { passwordSetAt: now.toISOString() },
    metadata: { event: "password_changed_self" },
  });

  return NextResponse.json({ ok: true, passwordSetAt: now });
}
