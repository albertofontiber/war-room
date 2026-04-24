import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { LeadCreateSchema, zodError } from "@/lib/validation";
import type { DealStage } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads
 * Crea un "lead anónimo" — Empresa sin identidad real conocida (confidencial).
 *
 * El CIF se auto-genera como "LEAD-{id}". Se crea también CrmEstado con el stage
 * inicial indicado. Si se pasan datos financieros, se crea un Financiero del
 * año correspondiente.
 *
 * Requiere usuario autenticado (admin). Siempre marca esAnonima=true, enPerimetro=true.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = LeadCreateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);
    const body = parsed.data;

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // Crear empresa con CIF placeholder (lo actualizamos después con su id)
      const empresa = await tx.empresa.create({
        data: {
          cif: `LEAD-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
          nombre: body.nombre,
          esAnonima: true,
          enPerimetro: true,
          enPerimetroAt: now,
          sector: body.sector ?? null,
          provincia: body.provincia ?? null,
          ccaa: body.ccaa ?? null,
          empleados: body.empleados ?? null,
          descripcion: body.descripcion ?? null,
          fuente: "lead_manual",
          finderSourceId: body.finderId ?? null,
        },
      });

      // Estabilizar CIF al formato canónico "LEAD-{id}"
      await tx.empresa.update({
        where: { id: empresa.id },
        data: { cif: `LEAD-${empresa.id}` },
      });

      // CrmEstado con stage inicial
      await tx.crmEstado.create({
        data: {
          empresaId: empresa.id,
          dealStage: body.dealStage as DealStage,
          ownerUserId: body.ownerUserId ?? user.id,
          fechaEntradaStage: now,
        },
      });

      // CrmLog de entrada al funnel
      await tx.crmLog.create({
        data: {
          empresaId: empresa.id,
          event: "new_deal",
          fromStage: null,
          toStage: body.dealStage,
          autorId: user.id,
          note: "Lead anónimo creado manualmente",
        },
      });

      // Financiero si se proporcionó algún dato
      if (
        body.ingresos != null ||
        body.margenBruto != null ||
        body.ebitda != null
      ) {
        const anio = body.anioFinanciero ?? now.getFullYear() - 1;
        await tx.financiero.create({
          data: {
            empresaId: empresa.id,
            anio,
            ingresos: body.ingresos ?? null,
            margenBruto: body.margenBruto ?? null,
            ebitda: body.ebitda ?? null,
            fuente: "lead_manual",
          },
        });
      }

      return { empresaId: empresa.id };
    });

    return NextResponse.json(
      { ok: true, empresaId: result.empresaId },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/leads]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
