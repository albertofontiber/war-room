import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { NotaCreateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { notifyUser } from "@/lib/notifications";
import { loadThreadRoot, visibilityForReply } from "@/lib/notas-thread";
import { log } from "@/lib/logger";

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

    // Devolvemos flat con parentId/visibleAFinder; el cliente arma el árbol.
    // Order asc para que el cliente pueda iterar y siempre tenga el padre antes
    // que la respuesta (más fácil de construir el índice por id).
    const notas = await prisma.nota.findMany({
      where: { empresaId },
      include: {
        autor: { select: { id: true, name: true } },
        autorFinder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(notas);
  } catch (err) {
    log.error("api/empresas/[id]/notas GET", err);
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

    let visibleAFinder = false; // Default para notas root de admin (interna).
    let notifyParentAuthorUserId: string | null = null;

    if (parsed.data.parentId !== undefined) {
      const root = await loadThreadRoot(parsed.data.parentId);
      if (!root || root.empresaId !== empresaId) {
        return NextResponse.json(
          { error: "Nota padre no encontrada o de otra empresa" },
          { status: 400 }
        );
      }
      visibleAFinder = visibilityForReply(root);

      // Si el autor del padre directo es admin distinto al responder,
      // notificarle que tiene respuesta. Padres que son finders → diferido
      // a PR de menciones (cuando exista Notificacion.finderId).
      const parent = await prisma.nota.findUnique({
        where: { id: parsed.data.parentId },
        select: { autorId: true, autorFinderId: true },
      });
      if (parent?.autorId && parent.autorId !== user.id) {
        notifyParentAuthorUserId = parent.autorId;
      }
    }

    const nota = await prisma.nota.create({
      data: {
        empresaId,
        autorId: user.id,
        contenido: parsed.data.contenido,
        parentId: parsed.data.parentId ?? null,
        visibleAFinder,
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
      after: { contenido: nota.contenido, empresaId, parentId: nota.parentId },
    });

    if (notifyParentAuthorUserId) {
      const preview = nota.contenido.length > 140
        ? nota.contenido.slice(0, 140) + "…"
        : nota.contenido;
      void notifyUser({
        userId: notifyParentAuthorUserId,
        tipo: "nota_respuesta",
        titulo: `${user.name ?? "Alguien"} respondió a tu nota`,
        mensaje: preview,
        link: `/?empresa=${empresaId}`,
        email: false,
      }).catch((err) => log.error("api/empresas/[id]/notas POST notifyUser", err));
    }

    return NextResponse.json(nota, { status: 201 });
  } catch (err) {
    log.error("api/empresas/[id]/notas POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
