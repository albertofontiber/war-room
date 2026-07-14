import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StageChangeSchema, zodError } from "@/lib/validation";
import { cambiarEtapa } from "@/lib/crm-stage";
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
 *
 * La lógica de dominio (upsert + CrmLog + side-effects) vive en
 * `src/lib/crm-stage.ts` — compartida con el tool `cambiar_etapa` del chat IA.
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    const result = await cambiarEtapa({
      empresaId,
      dealStage,
      note,
      autorId: user?.id ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Empresa not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, empresaId, dealStage: result.dealStage });
  } catch (err) {
    log.error("api/empresas/[id]/stage PATCH", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
