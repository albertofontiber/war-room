/**
 * Helpers para threading de notas.
 *
 * Las respuestas a una nota heredan la visibilidad al finder del root del
 * thread, no del padre directo. Esto evita inconsistencias del tipo "el root
 * es visible al finder pero una respuesta intermedia no lo era, y ahora otra
 * respuesta más profunda hereda mal". Walk hacia arriba desde el padre hasta
 * encontrar el root (parentId == null).
 *
 * Profundidad ilimitada por diseño (Alberto, 2026-05-11). El walk es O(profundidad)
 * — si el thread crece descontroladamente, denormalizar `rootId` en `Nota` y
 * reemplazar el walk por un findUnique. Por ahora innecesario.
 */

import { prisma } from "@/lib/prisma";

export type ThreadRoot = {
  id: number;
  empresaId: number;
  autorId: string | null;
  autorFinderId: string | null;
  visibleAFinder: boolean;
};

type NotaWithParent = {
  id: number;
  empresaId: number;
  autorId: string | null;
  autorFinderId: string | null;
  visibleAFinder: boolean;
  parentId: number | null;
};

const SELECT_THREAD = {
  id: true,
  empresaId: true,
  autorId: true,
  autorFinderId: true,
  visibleAFinder: true,
  parentId: true,
} as const;

/**
 * Carga el root de un thread dado un parentId. Devuelve null si la nota no
 * existe (caller debe responder 404). Si el padre ya es root, lo devuelve
 * directamente. Loop guard implícito por la estructura (no hay forma de crear
 * ciclos vía la API: solo se permite parentId hacia notas existentes y un
 * UPDATE de parentId no está expuesto).
 */
export async function loadThreadRoot(parentId: number): Promise<ThreadRoot | null> {
  const initial = await prisma.nota.findUnique({
    where: { id: parentId },
    select: SELECT_THREAD,
  });
  if (!initial) return null;

  let cur: NotaWithParent = initial;

  // Walk hacia arriba. El index `@@index([parentId])` hace que sea barato.
  while (cur.parentId !== null) {
    const parent: NotaWithParent | null = await prisma.nota.findUnique({
      where: { id: cur.parentId },
      select: SELECT_THREAD,
    });
    if (!parent) break; // Padre borrado mientras walk — usamos el último válido como root.
    cur = parent;
  }

  return {
    id: cur.id,
    empresaId: cur.empresaId,
    autorId: cur.autorId,
    autorFinderId: cur.autorFinderId,
    visibleAFinder: cur.visibleAFinder,
  };
}

/**
 * Calcula el flag `visibleAFinder` que debe persistirse en una respuesta,
 * según el root del thread. Reglas:
 *   - Root creado por finder: la respuesta (sea de quien sea) está implícitamente
 *     en una conversación con el finder → visibleAFinder=true. Si no, el finder
 *     vería su propia nota sin la respuesta del admin, lo cual no tendría sentido.
 *   - Root creado por admin: hereda root.visibleAFinder. Si era interna (false),
 *     toda la rama sigue siendo interna; si era visible, toda la rama lo es.
 */
export function visibilityForReply(root: ThreadRoot): boolean {
  if (root.autorFinderId) return true;
  return root.visibleAFinder;
}
