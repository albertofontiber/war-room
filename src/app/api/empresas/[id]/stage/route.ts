import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StageChangeSchema, zodError } from "@/lib/validation";
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
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
        owner: user?.name?.toLowerCase() ?? null,
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

    return NextResponse.json({ ok: true, empresaId, dealStage });
  } catch (err) {
    console.error("[PATCH /api/empresas/[id]/stage]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
