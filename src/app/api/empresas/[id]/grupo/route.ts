import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GrupoAssignSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Solo admins. Antes este endpoint solo llamaba `getCurrentUser()` (que
    // devuelve null silente sin sesión) y nunca verificaba el resultado, así
    // que cualquier anónimo podía reasignar grupos.
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    const id = parseInt(params.id);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const parsed = GrupoAssignSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);
    const grupoNombre: string | null = parsed.data.grupoNombre?.trim() || null;

    let grupoId: number | null = null;

    if (grupoNombre) {
      // Find existing group or create new one
      const existing = await prisma.grupo.findFirst({ where: { nombre: grupoNombre } });
      if (existing) {
        grupoId = existing.id;
      } else {
        const created = await prisma.grupo.create({
          data: { nombre: grupoNombre, tipo: "nacional" },
        });
        grupoId = created.id;
      }
    }

    const prev = await prisma.empresa.findUnique({
      where: { id },
      select: { grupoId: true, grupo: { select: { nombre: true } } },
    });
    const empresa = await prisma.empresa.update({
      where: { id },
      data: { grupoId },
      select: {
        id: true,
        grupoId: true,
        grupo: { select: { id: true, nombre: true } },
      },
    });
    if (prev && prev.grupoId !== empresa.grupoId) {
      void auditLog({
        actorType: "admin",
        actorId: user?.id ?? null,
        action: "update",
        entityType: "empresa",
        entityId: id,
        before: { grupoId: prev.grupoId, grupoNombre: prev.grupo?.nombre ?? null },
        after: { grupoId: empresa.grupoId, grupoNombre: empresa.grupo?.nombre ?? null },
      });
    }

    return NextResponse.json(empresa);
  } catch (error) {
    console.error("PATCH /api/empresas/[id]/grupo", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
