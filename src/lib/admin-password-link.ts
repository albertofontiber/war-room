import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Enlace de recuperación ("he olvidado mi contraseña"). */
export const RESET_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Enlace de invitación: da margen a que el invitado lo abra otro día. */
export const INVITATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://warroom.fontiber.com";

export function adminPasswordLinkUrl(rawToken: string): string {
  return `${BASE_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Emite un enlace de un solo uso para que un usuario del war room fije su
 * contraseña (invitación o recuperación: el endpoint que lo consume es el
 * mismo, `/api/admin/reset-password`). Anula los enlaces anteriores sin usar,
 * así solo vale el último que se haya enviado. En BD solo queda el sha256.
 */
export async function issueAdminPasswordLink(
  userId: string,
  windowMs: number
): Promise<{ rawToken: string; expiresAt: Date; url: string }> {
  await revokeAdminPasswordLinks(userId);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + windowMs);

  await prisma.adminPasswordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return { rawToken, expiresAt, url: adminPasswordLinkUrl(rawToken) };
}

/** Marca como usados los enlaces pendientes (p. ej. al desactivar al usuario). */
export async function revokeAdminPasswordLinks(userId: string): Promise<void> {
  await prisma.adminPasswordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
