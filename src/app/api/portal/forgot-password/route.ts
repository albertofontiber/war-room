import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PortalForgotPasswordSchema, zodError } from "@/lib/validation";
import { sendPasswordResetEmail } from "@/lib/email-password-reset";

export const dynamic = "force-dynamic";

const RESET_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/portal/forgot-password — el finder pide un email con link de reset.
 *
 * Anti-enumeración: SIEMPRE devuelve 200 con el mismo mensaje, exista o no el
 * email. Si existe y el finder está activo, invalida tokens previos pendientes
 * y crea uno nuevo (raw 64 hex chars) cuyo sha256 se guarda en BD. El raw va
 * en el link del email. El endpoint público no es rate-limited a nivel
 * aplicación; confiamos en Vercel/Resend si llega abuso. La invalidación de
 * tokens previos limita el impacto: solo el último link válido funciona.
 */
export async function POST(req: NextRequest) {
  const parsed = PortalForgotPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const { email } = parsed.data;

  const finder = await prisma.finder.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, active: true },
  });

  // Anti-enumeración: respuesta siempre idéntica.
  const genericResponse = NextResponse.json({ ok: true });

  if (!finder || !finder.active) return genericResponse;

  // Invalida tokens previos no usados (marca usedAt = now). Un finder solo
  // tiene un link válido en cada momento.
  await prisma.passwordResetToken.updateMany({
    where: { finderId: finder.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + RESET_WINDOW_MS);

  await prisma.passwordResetToken.create({
    data: {
      finderId: finder.id,
      tokenHash,
      expiresAt,
    },
  });

  // Fire-and-forget: si Resend falla, ya quedó loggeado y devolvemos 200 igual.
  // El finder vería que no llega el email, pero no le mostramos error en este
  // endpoint para no leakear si su email está o no en BD.
  void sendPasswordResetEmail({
    to: finder.email,
    finderName: finder.name,
    rawToken,
    expiresAt,
  });

  return genericResponse;
}
