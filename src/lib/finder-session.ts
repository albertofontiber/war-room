import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * ¿Sigue siendo válida esta sesión de finder contra el estado actual de la BD?
 *
 * Dos motivos de invalidación:
 *  - El finder está inactivo (`active = false`): un admin lo pausó.
 *  - El `sessionVersion` del token no coincide con el de la BD: un admin pulsó
 *    "Cerrar sesiones activas" (o rotó la password), lo que sube el contador en
 *    BD e invalida todos los JWT emitidos antes.
 *
 * Los tokens emitidos antes de introducir el campo no llevan `sessionVersion`
 * (llega `null`/`undefined`); se normalizan a 0 para no forzar un re-login
 * masivo en el deploy que estrena esta feature.
 */
export function finderSessionMatches(
  finder: { active: boolean; sessionVersion: number } | null | undefined,
  tokenSessionVersion: number | null | undefined
): boolean {
  if (!finder || !finder.active) return false;
  return (tokenSessionVersion ?? 0) === finder.sessionVersion;
}

/**
 * Resuelve el Finder de la BD a partir de la sesión del portal.
 * Devuelve null si no hay sesión, si es admin, si el finder ya no está activo,
 * o si la sesión fue revocada (sessionVersion desincronizado).
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
    select: { id: true, name: true, email: true, active: true, sessionVersion: true },
  });
  if (!finderSessionMatches(finder, session.sessionVersion)) return null;
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

/**
 * Guard para las páginas autenticadas del portal (server components).
 * Revalida la sesión contra la BD en CADA render, así un finder desactivado o
 * con sesión revocada acaba en `/portal/login` aunque su cookie JWT siga siendo
 * criptográficamente válida (el middleware solo mira `kind` en el token, no la
 * BD). El redirect lanza `NEXT_REDIRECT`, por eso no devuelve en ese caso.
 */
export async function requireFinderPageOrRedirect() {
  const finder = await getCurrentFinder();
  if (!finder) redirect("/portal/login");
  return finder;
}

/** Ventana de edición para recursos creados desde el portal. Pasadas 24h, un
 * finder no puede editar ni borrar lo que él mismo creó — solo añadir nuevas
 * entradas. Esto alinea el comportamiento con sistemas tipo "immutable log"
 * y evita que una conversación histórica con un fundador se reescriba a
 * posteriori. */
export const PORTAL_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canEditWithin24h(createdAt: Date | string): boolean {
  const ts = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  if (isNaN(ts)) return false;
  return Date.now() - ts < PORTAL_EDIT_WINDOW_MS;
}
