import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export type FinderAction =
  | "login_success"
  | "login_failure"
  | "view_deals"
  | "view_deal"
  | "add_note"
  | "edit_note"
  | "delete_note"
  | "add_task"
  | "edit_task"
  | "complete_task"
  | "delete_task"
  | "add_activity" // legacy, ya no se emite (Actividad fusionada con Tarea en PR #39)
  | "propose_target"
  | "propose_target_duplicate";

/**
 * Registra una acción del finder en FinderAccessLog. Fire-and-forget: si falla
 * el insert (p.ej. BD saturada) no debería tumbar la request principal —
 * capturamos el error y lo logueamos.
 *
 * `finderId` es opcional porque en login_failure el email puede no corresponder
 * a ningún finder existente. En todos los demás casos debe pasarse.
 *
 * Uso típico:
 *   await logFinderAction({ finderId, action: "view_deal", resourceId: String(empresaId) });
 *   await logFinderAction({ email, action: "login_failure" });
 */
export async function logFinderAction(params: {
  finderId?: string | null;
  email?: string | null;
  action: FinderAction;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    await prisma.finderAccessLog.create({
      data: {
        finderId: params.finderId ?? null,
        email: params.email ?? null,
        action: params.action,
        resourceId: params.resourceId ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    log.error("lib/finder-access-log", err, { action: params.action });
  }
}
