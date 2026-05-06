import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { PortalResetPasswordSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/reset-password — consume un token de reset y establece la
 * password nueva del finder.
 *
 * Verifica que el token (sha256) está en BD, no usado y no caducado. Si OK,
 * bcrypt-hashea la pwd nueva y actualiza Finder + marca el token usedAt = now.
 * Auditamos como `password_reset_self` para distinguirlo del set manual del
 * admin (`password_set`). No revelamos al cliente la causa del 400 (token
 * inexistente vs. caducado vs. usado) — todos van como "Token inválido o
 * caducado".
 */
export async function POST(req: NextRequest) {
  const parsed = PortalResetPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const { token, password } = parsed.data;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      finderId: true,
      expiresAt: true,
      usedAt: true,
      finder: { select: { id: true, email: true, active: true } },
    },
  });

  const invalid = NextResponse.json(
    { error: "Token inválido o caducado" },
    { status: 400 }
  );
  if (!record) return invalid;
  if (record.usedAt) return invalid;
  if (record.expiresAt.getTime() < Date.now()) return invalid;
  if (!record.finder.active) return invalid;

  const hash = await bcrypt.hash(password, 10);
  const now = new Date();

  await prisma.$transaction([
    prisma.finder.update({
      where: { id: record.finderId },
      data: { passwordHash: hash, passwordSetAt: now },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
  ]);

  void auditLog({
    actorType: "finder",
    actorId: record.finderId,
    action: "update",
    entityType: "finder",
    entityId: record.finderId,
    after: { passwordSetAt: now.toISOString() },
    metadata: { event: "password_reset_self" },
  });

  return NextResponse.json({ ok: true });
}
