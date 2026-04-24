import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinderAssignSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/empresas/[id]/finder
 * Body: { finderId: string | null }
 * Asigna (o desasigna) un finder a la empresa.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const parsed = FinderAssignSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);
    const { finderId } = parsed.data;

    // Verificar que el finder existe si se asigna
    if (finderId) {
      const exists = await prisma.finder.findUnique({
        where: { id: finderId },
        select: { id: true, active: true },
      });
      if (!exists || !exists.active) {
        return NextResponse.json({ error: "Finder no encontrado o inactivo" }, { status: 400 });
      }
    }

    const empresa = await prisma.empresa.update({
      where: { id: empresaId },
      data: { finderSourceId: finderId },
      select: {
        id: true,
        finderSourceId: true,
        finderSource: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(empresa);
  } catch (err) {
    console.error("[PATCH empresa finder]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
