/**
 * Lado server-only de menciones: persistencia + notificación.
 *
 * El parser puro vive en `lib/menciones.ts` (importable desde cliente). Esta
 * versión añade:
 *   1. `processMenciones`: resolve contra BD, persiste filas `Mencion`,
 *      dispara notificaciones in-app (admin/finder según destinatario).
 *
 * Separados porque importar `notifications.ts` (que usa Resend) desde el
 * cliente revienta el bundle (`@react-email/render` no resuelve en el browser).
 */

import { prisma } from "@/lib/prisma";
import { notifyUser, notifyFinder } from "@/lib/notifications";
import { extractMenciones, stripMencionMarkers } from "@/lib/menciones";
import { log } from "@/lib/logger";

export type MencionEntity =
  | { kind: "nota"; id: number }
  | { kind: "tarea"; id: number };

export type MencionAuthor =
  | { kind: "u"; id: string; name: string }
  | { kind: "f"; id: string; name: string };

/**
 * Procesa las menciones de una nota/tarea recién creada o editada:
 *   1. Resuelve los candidatos contra BD (descarta IDs falsificados o usuarios
 *      desactivados).
 *   2. Persiste filas `Mencion` (dedup contra las menciones existentes para
 *      esa entidad — no hay constraint único por (entidad, destinatario)
 *      porque permitir múltiples sería confuso pero no crítico).
 *   3. Dispara `Notificacion` por cada destinatario nuevo (no notificado en
 *      una pasada anterior sobre la misma entidad). El autor NUNCA se
 *      autonotifica.
 *
 * Best-effort: errores en notificación se loguean y se traga (no rompemos la
 * creación de la nota/tarea por un fallo en Resend o en notify).
 */
export async function processMenciones(opts: {
  entity: MencionEntity;
  empresaId: number;
  empresaNombre: string;
  contenido: string;
  author: MencionAuthor;
  /** Link admin (ruta absoluta dentro de war room). */
  adminLink: string;
  /** Link portal finder (ruta absoluta dentro de portal). */
  portalLink: string;
  /** Texto descriptivo del contexto (ej. "nota", "tarea"). */
  context: "nota" | "tarea";
}): Promise<void> {
  const targets = extractMenciones(opts.contenido);
  if (targets.length === 0) return;

  const userIds = targets.filter((t) => t.kind === "u").map((t) => t.id);
  const finderIds = targets.filter((t) => t.kind === "f").map((t) => t.id);

  // Resolve contra BD: solo mencionables existentes y activos.
  const [users, finders] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds }, active: true },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    finderIds.length > 0
      ? prisma.finder.findMany({
          where: { id: { in: finderIds }, active: true },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  // Menciones ya persistidas para esta entidad (evitar duplicar al editar).
  const where =
    opts.entity.kind === "nota"
      ? { notaId: opts.entity.id }
      : { tareaId: opts.entity.id };
  const existing = await prisma.mencion.findMany({
    where,
    select: { userId: true, finderId: true },
  });
  const existingUserIds = new Set(existing.map((m) => m.userId).filter(Boolean) as string[]);
  const existingFinderIds = new Set(existing.map((m) => m.finderId).filter(Boolean) as string[]);

  const newUserMenciones = users.filter((u) => !existingUserIds.has(u.id));
  const newFinderMenciones = finders.filter((f) => !existingFinderIds.has(f.id));

  if (newUserMenciones.length === 0 && newFinderMenciones.length === 0) return;

  // Persistir + notificar fire-and-forget.
  const mencionRows: Array<{
    notaId: number | null;
    tareaId: number | null;
    userId: string | null;
    finderId: string | null;
  }> = [];
  for (const u of newUserMenciones) {
    mencionRows.push({
      notaId: opts.entity.kind === "nota" ? opts.entity.id : null,
      tareaId: opts.entity.kind === "tarea" ? opts.entity.id : null,
      userId: u.id,
      finderId: null,
    });
  }
  for (const f of newFinderMenciones) {
    mencionRows.push({
      notaId: opts.entity.kind === "nota" ? opts.entity.id : null,
      tareaId: opts.entity.kind === "tarea" ? opts.entity.id : null,
      userId: null,
      finderId: f.id,
    });
  }

  try {
    await prisma.mencion.createMany({ data: mencionRows });
  } catch (err) {
    log.error("lib/menciones-server createMany", err);
    return; // Si no podemos persistir, no notifiquemos (mantén consistencia).
  }

  const titulo = `${opts.author.name} te mencionó en una ${opts.context} de ${opts.empresaNombre}`;
  const preview = stripMencionMarkers(opts.contenido).slice(0, 140);

  // Notify admins (excepto si el autor es admin Y se autoreferenció).
  for (const u of newUserMenciones) {
    if (opts.author.kind === "u" && opts.author.id === u.id) continue;
    void notifyUser({
      userId: u.id,
      tipo: "mencion",
      titulo,
      mensaje: preview,
      link: opts.adminLink,
      email: false,
    }).catch((err) => log.error("lib/menciones-server notifyUser", err));
  }
  // Notify finders (excepto si el autor es finder Y se autoreferenció).
  for (const f of newFinderMenciones) {
    if (opts.author.kind === "f" && opts.author.id === f.id) continue;
    void notifyFinder({
      finderId: f.id,
      tipo: "mencion",
      titulo,
      mensaje: preview,
      link: opts.portalLink,
      email: false,
    }).catch((err) => log.error("lib/menciones-server notifyFinder", err));
  }
}
