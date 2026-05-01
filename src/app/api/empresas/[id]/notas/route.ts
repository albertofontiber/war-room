import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { NotaCreateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/empresas/[id]/notas
 * Lista de notas generales de la empresa, más recientes primero.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const notas = await prisma.nota.findMany({
      where: { empresaId },
      include: {
        autor: { select: { id: true, name: true } },
        autorFinder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(notas);
  } catch (err) {
    console.error("[GET notas]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/empresas/[id]/notas
 * Body: { contenido: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const parsed = NotaCreateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);

    const nota = await prisma.nota.create({
      data: {
        empresaId,
        autorId: user.id,
        contenido: parsed.data.contenido,
      },
      include: {
        autor: { select: { id: true, name: true } },
        autorFinder: { select: { id: true, name: true } },
      },
    });
    void auditLog({
      actorType: "admin",
      actorId: user.id,
      action: "create",
      entityType: "nota",
      entityId: nota.id,
      after: { contenido: nota.contenido, empresaId },
    });
    return NextResponse.json(nota, { status: 201 });
  } catch (err) {
    console.error("[POST notas]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
