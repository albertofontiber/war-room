import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinderAssignSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";
import { log } from "@/lib/logger";
import { sendFinderTargetAssignedEmail } from "@/lib/email-finder-assignment";

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
    // Solo admins. Antes solo verificaba que hubiera sesión.
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const user = await getCurrentUser();
    const prev = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { finderSourceId: true, nombre: true },
    });
    const empresa = await prisma.empresa.update({
      where: { id: empresaId },
      data: { finderSourceId: finderId },
      select: {
        id: true,
        nombre: true,
        finderSourceId: true,
        finderSource: { select: { id: true, name: true, email: true } },
      },
    });
    if (prev && prev.finderSourceId !== empresa.finderSourceId) {
      void auditLog({
        actorType: "admin",
        actorId: user?.id ?? null,
        action: "update",
        entityType: "empresa",
        entityId: empresaId,
        before: { finderSourceId: prev.finderSourceId },
        after: { finderSourceId: empresa.finderSourceId },
      });

      // Email al finder nuevo (solo si se asigna alguien — desasignar no
      // dispara email).
      if (empresa.finderSource && empresa.finderSource.email) {
        void sendFinderTargetAssignedEmail({
          to: empresa.finderSource.email,
          finderName: empresa.finderSource.name,
          empresaId: empresa.id,
          empresaNombre: empresa.nombre,
          asignadoPor: user?.name ?? "Un admin",
        }).catch((err) =>
          log.error("api/empresas/[id]/finder PATCH email", err)
        );
      }
    }

    return NextResponse.json(empresa);
  } catch (err) {
    log.error("api/empresas/[id]/finder PATCH", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
