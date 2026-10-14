import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdminForgotPasswordSchema, zodError } from "@/lib/validation";
import { sendAdminPasswordResetEmail } from "@/lib/email-password-reset";
import { issueAdminPasswordLink, RESET_WINDOW_MS } from "@/lib/admin-password-link";

export const dynamic = "force-dynamic";

/**
 * Solicita un enlace de recuperación para un admin del war room.
 *
 * La respuesta es siempre la misma para no revelar qué emails tienen acceso.
 * Solo se emite un token para usuarios activos con rol admin.
 */
export async function POST(req: NextRequest) {
  const parsed = AdminForgotPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const { email } = parsed.data;
  const genericResponse = NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  if (!user || !user.active || user.role !== "admin") return genericResponse;

  const { rawToken, expiresAt } = await issueAdminPasswordLink(
    user.id,
    RESET_WINDOW_MS
  );

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
