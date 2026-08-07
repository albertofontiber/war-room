import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AdminForgotPasswordSchema, zodError } from "@/lib/validation";
import { sendAdminPasswordResetEmail } from "@/lib/email-password-reset";
import { isConfiguredAdminEmail } from "@/lib/admin-credentials";

export const dynamic = "force-dynamic";

const RESET_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Solicita un enlace de recuperación para un admin del war room.
 *
 * La respuesta es siempre la misma para no revelar qué emails tienen acceso.
 * Solo se emite un token para usuarios activos con rol admin que, además,
 * correspondan a una de las dos identidades configuradas del login.
 */
export async function POST(req: NextRequest) {
  const parsed = AdminForgotPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const { email } = parsed.data;
  const genericResponse = NextResponse.json({ ok: true });
  if (!isConfiguredAdminEmail(email)) return genericResponse;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  if (!user || !user.active || user.role !== "admin") return genericResponse;

  await prisma.adminPasswordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + RESET_WINDOW_MS);

  await prisma.adminPasswordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  // La función no debe terminar antes que la petición a Resend: en Vercel el
  // trabajo fire-and-forget puede interrumpirse al devolver la respuesta.
  await sendAdminPasswordResetEmail({
    to: user.email,
    adminName: user.name,
    rawToken,
    expiresAt,
  });

  return genericResponse;
}
