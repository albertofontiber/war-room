import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { NotaCreateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { notifyUser, notifyFinder } from "@/lib/notifications";
import { loadThreadRoot, visibilityForReply } from "@/lib/notas-thread";
import { stripMencionMarkers } from "@/lib/menciones";
import { processMenciones } from "@/lib/menciones-server";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/empresas/[id]/notas
 * Lista de notas generales de la empresa, más recientes primero.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    let notifyParentAuthorFinderId: string | null = null;

    if (parsed.data.parentId !== undefined) {
      const root = await loadThreadRoot(parsed.data.parentId);
      if (!root || root.empresaId !== empresaId) {
        return NextResponse.json(
          { error: "Nota padre no encontrada o de otra empresa" },
          { status: 400 }
        );
      }
      visibleAFinder = visibilityForReply(root);

      // Notificar al autor del padre directo (admin O finder distinto al
      // responder). Si el padre es del propio admin, no autonotificar.
      const parent = await prisma.nota.findUnique({
        where: { id: parsed.data.parentId },
        select: { autorId: true, autorFinderId: true },
      });
      if (parent?.autorId && parent.autorId !== user.id) {
        notifyParentAuthorUserId = parent.autorId;
      }
      if (parent?.autorFinderId) {
        notifyParentAuthorFinderId = parent.autorFinderId;
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

    const previewClean = stripMencionMarkers(nota.contenido).slice(0, 140);

    if (notifyParentAuthorUserId) {
      void notifyUser({
        userId: notifyParentAuthorUserId,
        tipo: "nota_respuesta",
        titulo: `${user.name ?? "Alguien"} respondió a tu nota`,
        mensaje: previewClean,
        link: `/?empresa=${empresaId}`,
        email: false,
      }).catch((err) => log.error("api/empresas/[id]/notas POST notifyUser", err));
    }
    if (notifyParentAuthorFinderId) {
      void notifyFinder({
        finderId: notifyParentAuthorFinderId,
        tipo: "nota_respuesta",
        titulo: `${user.name ?? "Alguien"} respondió a tu nota`,
        mensaje: previewClean,
        link: `/portal/empresas/${empresaId}`,
        email: false,
      }).catch((err) => log.error("api/empresas/[id]/notas POST notifyFinder", err));
    }

    // Procesar menciones en el contenido — persiste filas Mencion y dispara
    // notificaciones a admins/finders mencionados (excepto al propio autor).
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { nombre: true },
    });
    void processMenciones({
      entity: { kind: "nota", id: nota.id },
      empresaId,
      empresaNombre: empresa?.nombre ?? "una empresa",
      contenido: nota.contenido,
      author: { kind: "u", id: user.id, name: user.name ?? "Admin" },
      adminLink: `/?empresa=${empresaId}`,
      portalLink: `/portal/empresas/${empresaId}`,
      context: "nota",
    }).catch((err) => log.error("api/empresas/[id]/notas POST processMenciones", err));

    return NextResponse.json(nota, { status: 201 });
  } catch (err) {
    log.error("api/empresas/[id]/notas POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
