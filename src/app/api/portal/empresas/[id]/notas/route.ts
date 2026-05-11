import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { logFinderAction } from "@/lib/finder-access-log";
import { notifyAdmins, notifyUser } from "@/lib/notifications";
import { auditLog } from "@/lib/audit-log";
import { PortalNotaCreateSchema, zodError } from "@/lib/validation";
import { loadThreadRoot, visibilityForReply } from "@/lib/notas-thread";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/empresas/:id/notas — crea una nota del finder sobre un
 * target suyo. El autor se infiere de la sesión (autorFinderId = finder.id).
 * Devuelve 404 si la empresa no está asignada a este finder (sin leak).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = PortalNotaCreateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const empresa = await prisma.empresa.findFirst({
    where: { id, finderSourceId: finder.id, esAnonima: false },
    select: { id: true, nombre: true },
  });
  if (!empresa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Si es respuesta, validar acceso del finder al thread y heredar visibilidad.
  let visibleAFinder = false;
  let notifyParentAuthorUserId: string | null = null;
  if (parsed.data.parentId !== undefined) {
    const root = await loadThreadRoot(parsed.data.parentId);
    if (!root || root.empresaId !== id) {
      return NextResponse.json(
        { error: "Nota padre no encontrada o de otra empresa" },
        { status: 400 }
      );
    }
    // Bloqueo: si el root es de admin con visibleAFinder=false → el finder
    // no debería ni saber que existe (no la ve en su lista). 404 sin leak.
    if (root.autorId !== null && !root.visibleAFinder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    visibleAFinder = visibilityForReply(root);

    // Notificar al admin autor del padre directo (si el padre es de un admin).
    const parent = await prisma.nota.findUnique({
      where: { id: parsed.data.parentId },
      select: { autorId: true },
    });
    if (parent?.autorId) notifyParentAuthorUserId = parent.autorId;
  }

  const nota = await prisma.nota.create({
    data: {
      empresaId: id,
      autorFinderId: finder.id,
      contenido: parsed.data.contenido,
      parentId: parsed.data.parentId ?? null,
      visibleAFinder,
    },
    select: {
      id: true,
      contenido: true,
      createdAt: true,
      parentId: true,
      autorFinder: { select: { name: true } },
    },
  });

  await logFinderAction({
    finderId: finder.id,
    action: "add_note",
    resourceId: String(nota.id),
  });

  void auditLog({
    actorType: "finder",
    actorId: finder.id,
    action: "create",
    entityType: "nota",
    entityId: nota.id,
    after: { contenido: nota.contenido, empresaId: id },
  });

  // Campanita in-app:
  //   - Notas root del finder → notifica a todos los admins (broadcast, igual que antes).
  //   - Respuestas a una nota de admin → notifica solo al admin autor del padre (dirigido).
  const preview = nota.contenido.length > 140
    ? nota.contenido.slice(0, 140) + "…"
    : nota.contenido;

  if (notifyParentAuthorUserId) {
    void notifyUser({
      userId: notifyParentAuthorUserId,
      tipo: "nota_respuesta",
      titulo: `${finder.name} respondió a tu nota en ${empresa.nombre}`,
      mensaje: preview,
      link: `/?empresa=${empresa.id}`,
      email: false,
    }).catch((err) => log.error("api/portal/empresas/[id]/notas POST notifyUser", err));
  } else {
    void notifyAdmins({
      tipo: "note_added",
      titulo: `${finder.name}: nueva nota en ${empresa.nombre}`,
      mensaje: preview,
      link: `/?empresa=${empresa.id}`,
      email: false,
    }).catch((err) => log.error("api/portal/empresas/[id]/notas POST notifyAdmins", err));
  }

  return NextResponse.json(nota, { status: 201 });
}
