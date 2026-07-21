import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AdminResetPasswordSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { isConfiguredAdminEmail } from "@/lib/admin-credentials";

export const dynamic = "force-dynamic";

/** Consume un token de un solo uso y guarda el nuevo hash en User. */
export async function POST(req: NextRequest) {
  const parsed = AdminResetPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const { token, password } = parsed.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const record = await prisma.adminPasswordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: {
        select: { id: true, email: true, role: true, active: true },
      },
    },
  });

  const invalid = NextResponse.json(
    { error: "Token inválido o caducado" },
    { status: 400 }
  );
  if (!record) return invalid;
  if (record.usedAt) return invalid;
  if (record.expiresAt.getTime() < Date.now()) return invalid;
  if (!record.user.active || record.user.role !== "admin") return invalid;
  if (!isConfiguredAdminEmail(record.user.email)) return invalid;

  const hash = await bcrypt.hash(password, 10);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: hash, passwordSetAt: now },
    }),
    prisma.adminPasswordResetToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
  ]);

  void auditLog({
    actorType: "admin",
    actorId: record.userId,
    action: "update",
    entityType: "user",
    entityId: record.userId,
    after: { passwordSetAt: now.toISOString() },
    metadata: { event: "password_reset_self" },
  });

  return NextResponse.json({ ok: true });
}
