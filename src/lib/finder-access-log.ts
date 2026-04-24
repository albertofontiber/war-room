import { prisma } from "@/lib/prisma";

/**
 * Registra una acción del finder en FinderAccessLog. Fire-and-forget: si falla
 * el insert (p.ej. BD saturada) no debería tumbar la request principal —
 * capturamos el error y lo logueamos a consola.
 *
 * Uso típico:
 *   await logFinderAction({ finderId, action: "view_deal", resourceId: String(empresaId) });
 */
export async function logFinderAction(params: {
  finderId: string;
  action: "view_deals" | "view_deal" | "add_note" | "add_task" | "add_activity" | "propose_target" | "propose_target_duplicate";
  resourceId?: string | null;
}) {
  try {
    await prisma.finderAccessLog.create({
      data: {
        finderId: params.finderId,
        action: params.action,
        resourceId: params.resourceId ?? null,
      },
    });
  } catch (err) {
    console.error("[logFinderAction]", params.action, err);
  }
}
