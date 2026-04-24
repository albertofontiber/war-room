import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Resuelve el Finder de la BD a partir de la sesión del portal.
 * Devuelve null si no hay sesión, si es admin, o si el finder ya no está activo.
 *
 * Los endpoints del portal (`/api/portal/*`) usan `requireCurrentFinder()` para
 * filtrar todo por `finderSourceId === finder.id`. Nunca leak datos de empresas
 * que no estén asignadas a ese finder.
 */
export async function getCurrentFinder() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "finder" || !session.finderId) return null;

  const finder = await prisma.finder.findUnique({
    where: { id: session.finderId },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!finder || !finder.active) return null;
  return finder;
}

export async function requireCurrentFinder() {
  const finder = await getCurrentFinder();
  if (!finder) {
    const error = new Error("Unauthorized") as Error & { status?: number };
    error.status = 401;
    throw error;
  }
  return finder;
}
