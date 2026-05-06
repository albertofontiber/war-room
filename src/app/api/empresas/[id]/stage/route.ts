import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StageChangeSchema, zodError } from "@/lib/validation";
import { createEmpresaLinks } from "@/lib/empresa-link-builder";
import { notifyAdmins } from "@/lib/notifications";
import { log } from "@/lib/logger";
import type { DealStage } from "@/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/empresas/[id]/stage
 *
 * Cambia el dealStage de una empresa y registra la transición en CrmLog.
 * Crea el CrmEstado si no existe (entrada al funnel desde la ficha).
 *
 * Body: { dealStage: DealStage | null, note?: string }
 *   - dealStage = null → se interpreta como "sacar del funnel" (borra CrmEstado)
 *   - note      = comentario opcional para el log
 *
 * El autor se resuelve desde la sesión (User.email → User.id).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Solo admins. Antes solo verificaba que hubiera sesión con email.
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin" || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const parsed = StageChangeSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);
    const dealStage = parsed.data.dealStage as DealStage | null;
    const note = parsed.data.note;

    // Resolver usuario actual (admin) para autoría
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true },
    });

    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, crmEstado: true },
    });
    if (!empresa) {
      return NextResponse.json({ error: "Empresa not found" }, { status: 404 });
    }

    const previo = empresa.crmEstado?.dealStage ?? null;
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
          autorId: user?.id ?? null,
          note: note ?? null,
        },
      });
      return NextResponse.json({ ok: true, empresaId, dealStage: null });
    }

    // Caso 2: upsert con nuevo stage
    const stageCambio = previo !== dealStage;

    await prisma.crmEstado.upsert({
      where: { empresaId },
      create: {
        empresaId,
        dealStage,
        ownerUserId: user?.id ?? null,
        fechaEntradaStage: now,
      },
      update: {
        dealStage,
        // Solo actualiza fechaEntradaStage si el stage cambió
        ...(stageCambio ? { fechaEntradaStage: now } : {}),
      },
    });

    // Log solo si hubo cambio real o si es entrada nueva al funnel
    if (stageCambio || !empresa.crmEstado) {
      await prisma.crmLog.create({
        data: {
          empresaId,
          event: empresa.crmEstado ? "stage_changed" : "new_deal",
          fromStage: previo,
          toStage: dealStage,
          autorId: user?.id ?? null,
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

    return NextResponse.json({ ok: true, empresaId, dealStage });
  } catch (err) {
    log.error("api/empresas/[id]/stage PATCH", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Crea carpeta OneDrive y página Notion para una empresa que acaba de entrar
 * a `primera_reunion`. Fire-and-forget desde el handler de stage para no
 * bloquear la respuesta.
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
