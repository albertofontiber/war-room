// ─── Cambio de etapa (dealStage) de una empresa ──────────────────────────────
// Lógica extraída de PATCH /api/empresas/[id]/stage para poder reutilizarla
// desde otros callers (tool `cambiar_etapa` del chat IA; en el futuro, la
// automatización email LOI → "LOI enviada"). El endpoint queda como wrapper
// fino de auth/validación HTTP sobre este helper.

import { prisma } from "@/lib/prisma";
import { createEmpresaLinks } from "@/lib/empresa-link-builder";
import { notifyAdmins } from "@/lib/notifications";
import { log } from "@/lib/logger";
import type { DealStage } from "@/types";

export type CambiarEtapaInput = {
  empresaId: number;
  /** null = sacar del funnel (borra CrmEstado). */
  dealStage: DealStage | null;
  /** Comentario opcional para el CrmLog. */
  note?: string | null;
  /** User.id del autor, para autoría en CrmLog/CrmEstado. */
  autorId?: string | null;
};

export type CambiarEtapaResult =
  | { ok: false; error: "empresa_not_found" }
  | {
      ok: true;
      empresaId: number;
      fromStage: DealStage | null;
      dealStage: DealStage | null;
      /** false = la empresa ya estaba en ese stage (upsert sin transición). */
      changed: boolean;
      event: "removed_from_funnel" | "new_deal" | "stage_changed" | null;
    };

/**
 * Cambia el dealStage de una empresa y registra la transición en CrmLog.
 * Crea el CrmEstado si no existe (entrada al funnel); dealStage=null lo borra
 * (sacar del funnel). Dispara los side-effects de stage (auto-crear docs al
 * entrar a `primera_reunion`, fire-and-forget).
 *
 * No valida permisos ni `esAnonima` — eso es responsabilidad del caller.
 */
export async function cambiarEtapa({
  empresaId,
  dealStage,
  note,
  autorId,
}: CambiarEtapaInput): Promise<CambiarEtapaResult> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, crmEstado: true },
  });
  if (!empresa) {
    return { ok: false, error: "empresa_not_found" };
  }

  const previo = (empresa.crmEstado?.dealStage ?? null) as DealStage | null;
  const now = new Date();

  // Caso 1: sacar del funnel
  if (dealStage === null) {
    if (empresa.crmEstado) {
      await prisma.crmEstado.delete({ where: { empresaId } });
    }
    await prisma.crmLog.create({
      data: {
        empresaId,
        event: "removed_from_funnel",
        fromStage: previo,
        toStage: null,
        autorId: autorId ?? null,
        note: note ?? null,
      },
    });
    return {
      ok: true,
      empresaId,
      fromStage: previo,
      dealStage: null,
      changed: true,
      event: "removed_from_funnel",
    };
  }

  // Caso 2: upsert con nuevo stage
  const stageCambio = previo !== dealStage;

  await prisma.crmEstado.upsert({
    where: { empresaId },
    create: {
      empresaId,
      dealStage,
      ownerUserId: autorId ?? null,
      fechaEntradaStage: now,
    },
    update: {
      dealStage,
      // Solo actualiza fechaEntradaStage si el stage cambió
      ...(stageCambio ? { fechaEntradaStage: now } : {}),
    },
  });

  // Log solo si hubo cambio real o si es entrada nueva al funnel
  const event = empresa.crmEstado ? "stage_changed" : "new_deal";
  if (stageCambio || !empresa.crmEstado) {
    await prisma.crmLog.create({
      data: {
        empresaId,
        event,
        fromStage: previo,
        toStage: dealStage,
        autorId: autorId ?? null,
        note: note ?? null,
      },
    });
  }

  // Auto-crear docs externos cuando una empresa entra a `primera_reunion`
  // por primera vez. Heurística "primera vez" = la empresa no tiene URLs
  // poblados todavía; cubre tanto entradas nuevas como retornos a
  // primera_reunion desde un stage previo (en cuyo caso no habría retroceso
  // que recree carpetas porque ya existen URLs guardadas).
  if (stageCambio && dealStage === "primera_reunion") {
    void autoCreateDocsForFirstMeeting(empresaId);
  }

  return {
    ok: true,
    empresaId,
    fromStage: previo,
    dealStage,
    changed: stageCambio,
    event: stageCambio || !empresa.crmEstado ? event : null,
  };
}

/**
 * Crea carpeta OneDrive y página Notion para una empresa que acaba de entrar
 * a `primera_reunion`. Fire-and-forget desde `cambiarEtapa` para no bloquear
 * la respuesta.
 *
 * Guards (defensa en profundidad además del `stageCambio` del caller):
 *   - Si la empresa ya tiene oneDriveUrl o notionUrl → skip silencioso.
 *   - Si fallan Graph/Notion → log + notifyAdmins con detalle del error.
 */
async function autoCreateDocsForFirstMeeting(empresaId: number): Promise<void> {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, nombre: true, oneDriveUrl: true, notionUrl: true },
    });
    if (!empresa) return;
    if (empresa.oneDriveUrl || empresa.notionUrl) {
      log.info("stage-trigger", `skip auto-create: ya tiene URLs`, {
        empresaId,
        oneDriveUrl: !!empresa.oneDriveUrl,
        notionUrl: !!empresa.notionUrl,
      });
      return;
    }

    const created = await createEmpresaLinks(empresa.nombre);
    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        oneDriveUrl: created.oneDriveUrl,
        notionUrl: created.notionUrl,
      },
    });

    log.info("stage-trigger", `auto-created docs for "${empresa.nombre}"`, {
      empresaId,
      folderName: created.folder.name,
    });

    await notifyAdmins({
      tipo: "docs_creados",
      titulo: `📁 Carpeta + página creadas para ${empresa.nombre}`,
      mensaje: `Avanzó a 1ª reunión y se creó automáticamente "${created.folder.name}" en OneDrive (con subcarpetas Analyses/NDA/IRL) y página simétrica en Notion.`,
      link: `/pipeline?empresa=${empresaId}`,
    });
  } catch (err) {
    log.error("stage-trigger", err, { empresaId });
    // Notificar el fallo para que el usuario sepa que tiene que crear manual
    try {
      await notifyAdmins({
        tipo: "docs_error",
        titulo: `⚠️ Error creando docs automáticamente (empresa #${empresaId})`,
        mensaje: `La empresa avanzó a 1ª reunión pero falló la creación de carpeta/página. Revisa el panel y crea manualmente con el botón "Crear carpeta y página". Detalle: ${err instanceof Error ? err.message : String(err)}`,
        link: `/pipeline?empresa=${empresaId}`,
      });
    } catch {
      // Si incluso notificar falla, ya hicimos log.error arriba.
    }
  }
}
