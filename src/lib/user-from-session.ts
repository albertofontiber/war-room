import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Resuelve el User de la BD a partir de la sesión autenticada (NextAuth).
 * Usa el email como puente (ver docs en crm_module.md).
 * Si no hay sesión o el email no está registrado en User, devuelve null.
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, role: true },
  });
}

/** Variante que exige sesión válida, útil para handlers que requieren auth. */
export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return user;
}
