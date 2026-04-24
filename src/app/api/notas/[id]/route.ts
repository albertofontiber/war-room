import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/notas/[id]
 * Body: { contenido: string }
 * Cualquier admin puede editar cualquier nota (compartido Alberto/Gabriel).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const notaId = Number(params.id);
    if (!Number.isFinite(notaId)) {
      return NextResponse.json({ error: "Invalid nota id" }, { status: 400 });
    }

    const { contenido } = (await req.json()) as { contenido?: string };
    if (!contenido?.trim()) {
      return NextResponse.json({ error: "Content required" }, { status: 400 });
    }

    const nota = await prisma.nota.update({
      where: { id: notaId },
      data: { contenido: contenido.trim() },
      include: { autor: { select: { id: true, name: true } } },
    });
    return NextResponse.json(nota);
  } catch (err) {
    console.error("[PATCH nota]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/notas/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const notaId = Number(params.id);
    if (!Number.isFinite(notaId)) {
      return NextResponse.json({ error: "Invalid nota id" }, { status: 400 });
    }

    await prisma.nota.delete({ where: { id: notaId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE nota]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
