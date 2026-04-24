import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { NotaUpdateSchema, zodError } from "@/lib/validation";

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

    const parsed = NotaUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);

    const nota = await prisma.nota.update({
      where: { id: notaId },
      data: { contenido: parsed.data.contenido },
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
