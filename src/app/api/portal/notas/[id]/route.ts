import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder, canEditWithin24h } from "@/lib/finder-session";
import { PortalNotaUpdateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { processMenciones } from "@/lib/menciones-server";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PATCH/DELETE /api/portal/notas/:id — operaciones sobre una nota propia del
 * finder. Solo si `autorFinderId === finder.id` y `createdAt` dentro de la
 * ventana de 24h. En otro caso 403. Si la nota no existe o es de otro usuario
 * → 404 (sin leak de existencia).
 */
async function loadOwnNota(
  finderId: string,
  rawId: string
): Promise<{ notaId: number } | { error: string; status: number }> {
  const notaId = parseInt(rawId, 10);
  if (isNaN(notaId)) return { error: "Invalid id", status: 400 };

  const nota = await prisma.nota.findFirst({
    where: { id: notaId, autorFinderId: finderId },
    select: { id: true, createdAt: true },
  });
  if (!nota) return { error: "Not found", status: 404 };
  if (!canEditWithin24h(nota.createdAt)) {
    return {
      error: "Edit window (24h) expired. Añade una nueva nota en su lugar.",
      status: 403,
    };
  }
  return { notaId: nota.id };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = PortalNotaUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const res = await loadOwnNota(finder.id, params.id);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  const prev = await prisma.nota.findUnique({
    where: { id: res.notaId },
    select: {
      contenido: true,
      empresaId: true,
      empresa: { select: { nombre: true } },
    },
  });
  const nota = await prisma.nota.update({
    where: { id: res.notaId },
    data: { contenido: parsed.data.contenido },
    select: {
      id: true,
      contenido: true,
      createdAt: true,
      autorFinder: { select: { name: true } },
    },
  });
  if (prev && prev.contenido !== nota.contenido) {
    void auditLog({
      actorType: "finder",
      actorId: finder.id,
      action: "update",
      entityType: "nota",
      entityId: nota.id,
      before: { contenido: prev.contenido },
      after: { contenido: nota.contenido },
    });
    void processMenciones({
      entity: { kind: "nota", id: nota.id },
      empresaId: prev.empresaId,
      empresaNombre: prev.empresa?.nombre ?? "una empresa",
      contenido: nota.contenido,
      author: { kind: "f", id: finder.id, name: finder.name },
      adminLink: `/?empresa=${prev.empresaId}`,
      portalLink: `/portal/empresas/${prev.empresaId}`,
      context: "nota",
    }).catch((err) => log.error("api/portal/notas/[id] PATCH processMenciones", err));
  }
  return NextResponse.json(nota);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await loadOwnNota(finder.id, params.id);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  const prev = await prisma.nota.findUnique({
    where: { id: res.notaId },
    select: { contenido: true, empresaId: true },
  });
  await prisma.nota.delete({ where: { id: res.notaId } });
  if (prev) {
    void auditLog({
      actorType: "finder",
      actorId: finder.id,
      action: "delete",
      entityType: "nota",
      entityId: res.notaId,
      before: prev,
    });
  }
  return NextResponse.json({ ok: true });
}
