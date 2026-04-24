import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GrupoAssignSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    const empresa = await prisma.empresa.update({
      where: { id },
      data: { grupoId },
      select: {
        id: true,
        grupoId: true,
        grupo: { select: { id: true, nombre: true } },
      },
    });

    return NextResponse.json(empresa);
  } catch (error) {
    console.error("PATCH /api/empresas/[id]/grupo", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
