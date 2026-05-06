import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/user-from-session";
import { LeadLinkSchema, zodError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/:id/link — vincula un lead anónimo a una empresa real.
 *
 * Mueve Nota, Tarea, CrmLog, FinderNote, TargetProposal y Financiero (los del
 * lead; el del target ya existente se respeta si colisiona año) al target.
 * El CrmEstado del lead prevalece (stage, fechaEntradaStage, ownerUser); si el
 * target tenía uno se descarta. Si el target no tenía finderSourceId y el lead
 * sí, lo hereda. Deja un CrmLog en el target marcando el merge y borra el lead.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let user;
  try {
    user = await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leadId = parseInt(params.id, 10);
  if (isNaN(leadId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const parsed = LeadLinkSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const { targetEmpresaId } = parsed.data;

  if (leadId === targetEmpresaId) {
    return NextResponse.json(
      { error: "targetEmpresaId must be different from lead id" },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.empresa.findUnique({
        where: { id: leadId },
        include: { crmEstado: true },
      });
      if (!lead) throw new HttpError(404, "Lead not found");
      if (!lead.esAnonima) throw new HttpError(400, "Source is not an anonymous lead");

      const target = await tx.empresa.findUnique({
        where: { id: targetEmpresaId },
        include: { crmEstado: true },
      });
      if (!target) throw new HttpError(404, "Target empresa not found");
      if (target.esAnonima) throw new HttpError(400, "Target is an anonymous lead");

      // 1. Mover relaciones con FK simple a Empresa (empresaId)
      await tx.nota.updateMany({ where: { empresaId: leadId }, data: { empresaId: targetEmpresaId } });
      await tx.tarea.updateMany({ where: { empresaId: leadId }, data: { empresaId: targetEmpresaId } });
      await tx.crmLog.updateMany({ where: { empresaId: leadId }, data: { empresaId: targetEmpresaId } });
      await tx.finderNote.updateMany({ where: { empresaId: leadId }, data: { empresaId: targetEmpresaId } });
      await tx.targetProposal.updateMany({ where: { empresaId: leadId }, data: { empresaId: targetEmpresaId } });

      // 2. Financieros: unique(empresaId, anio). Solo movemos los que no colisionan con un año ya presente en target.
      const targetAnios = await tx.financiero.findMany({
        where: { empresaId: targetEmpresaId },
        select: { anio: true },
      });
      const targetAniosSet = new Set(targetAnios.map((f) => f.anio));
      const leadFin = await tx.financiero.findMany({ where: { empresaId: leadId } });
      for (const f of leadFin) {
        if (targetAniosSet.has(f.anio)) {
          // Ya hay uno en el target para ese año → descartamos el del lead.
          await tx.financiero.delete({ where: { id: f.id } });
        } else {
          await tx.financiero.update({ where: { id: f.id }, data: { empresaId: targetEmpresaId } });
        }
      }

      // 3. CrmEstado: el del lead prevalece siempre. Si el target tenía, lo borramos.
      const previousTargetStage = target.crmEstado?.dealStage ?? null;
      if (target.crmEstado) {
        await tx.crmEstado.delete({ where: { empresaId: targetEmpresaId } });
      }
      if (lead.crmEstado) {
        await tx.crmEstado.update({
          where: { empresaId: leadId },
          data: { empresaId: targetEmpresaId },
        });
      }

      // 4. Finder: si el target no tiene y el lead sí → se hereda.
      if (!target.finderSourceId && lead.finderSourceId) {
        await tx.empresa.update({
          where: { id: targetEmpresaId },
          data: { finderSourceId: lead.finderSourceId },
        });
      }

      // 5. CrmLog de auditoría del merge.
      const newStage = lead.crmEstado?.dealStage ?? null;
      const mergeNote = `Vinculado desde lead anónimo «${lead.nombre}»`;
      await tx.crmLog.create({
        data: {
          empresaId: targetEmpresaId,
          event: previousTargetStage ? "stage_changed" : "new_deal",
          fromStage: previousTargetStage,
          toStage: newStage,
          autorId: user.id,
          note: mergeNote,
        },
      });

      // 6. Borrar el lead. A estas alturas no debería quedar nada apuntando a él.
      await tx.empresa.delete({ where: { id: leadId } });

      return { targetEmpresaId };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    log.error("api/leads/[id]/link POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
