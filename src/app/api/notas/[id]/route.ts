import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { NotaUpdateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { processMenciones } from "@/lib/menciones-server";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/notas/[id]
 * Body: { contenido: string }
 * Solo admins (kind="admin"). Compartido Alberto/Gabriel.
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Defensa en profundidad: exige kind="admin" explícito. Antes solo se
    // verificaba `getCurrentUser()` (bloquea finders por accidente porque
    // están en tabla aparte) — frágil si en el futuro se sincroniza un
    // finder con un User.
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const notaId = Number(params.id);
    if (!Number.isFinite(notaId)) {
      return NextResponse.json({ error: "Invalid nota id" }, { status: 400 });
    }

    const parsed = NotaUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);

    const prev = await prisma.nota.findUnique({
      where: { id: notaId },
      select: { contenido: true, empresaId: true, empresa: { select: { nombre: true } } },
    });
    const nota = await prisma.nota.update({
      where: { id: notaId },
      data: { contenido: parsed.data.contenido },
      include: { autor: { select: { id: true, name: true } } },
    });
    if (prev && prev.contenido !== nota.contenido) {
      void auditLog({
        actorType: "admin",
        actorId: user.id,
        action: "update",
        entityType: "nota",
        entityId: notaId,
        before: { contenido: prev.contenido },
        after: { contenido: nota.contenido },
      });
      // Reprocesar menciones — dedup contra existing impide notificar de nuevo
      // a quien ya estaba mencionado en la versión anterior. Solo nuevos
      // mencionados reciben campanita.
      if (prev) {
        void processMenciones({
          entity: { kind: "nota", id: notaId },
          empresaId: prev.empresaId,
          empresaNombre: prev.empresa?.nombre ?? "una empresa",
          contenido: nota.contenido,
          author: { kind: "u", id: user.id, name: user.name ?? "Admin" },
          adminLink: `/?empresa=${prev.empresaId}`,
          portalLink: `/portal/empresas/${prev.empresaId}`,
          context: "nota",
        }).catch((err) => log.error("api/notas/[id] PATCH processMenciones", err));
      }
    }
    return NextResponse.json(nota);
  } catch (err) {
    log.error("api/notas/[id] PATCH", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/notas/[id]
 * Solo admins (kind="admin").
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const notaId = Number(params.id);
    if (!Number.isFinite(notaId)) {
      return NextResponse.json({ error: "Invalid nota id" }, { status: 400 });
    }

    const prev = await prisma.nota.findUnique({
      where: { id: notaId },
      select: { contenido: true, empresaId: true, autorId: true, autorFinderId: true },
    });
    await prisma.nota.delete({ where: { id: notaId } });
    if (prev) {
      void auditLog({
        actorType: "admin",
        actorId: user.id,
        action: "delete",
        entityType: "nota",
        entityId: notaId,
        before: prev,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("api/notas/[id] DELETE", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
