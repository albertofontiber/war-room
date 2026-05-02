import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchEmpresaLinks } from "@/lib/empresa-link-matcher";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/empresas/[id]/links/sync
 *
 * Búsqueda automática de carpeta OneDrive y página Notion para una empresa.
 * Matcher en `lib/empresa-link-matcher.ts` (cascada normalize → alias).
 *
 * Comportamiento:
 *   - Si para una plataforma hay match unívoco → guarda la URL.
 *   - Si hay miss o ambigüedad → no toca el campo y devuelve detalle al cliente.
 *   - Solo escribe campos no nulos del nuevo match (no pisa una URL existente
 *     con miss accidental).
 *
 * Devuelve un objeto con el estado de cada plataforma + la empresa actualizada.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const empresa = await prisma.empresa.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        nombreComercial: true,
        oneDriveUrl: true,
        notionUrl: true,
      },
    });
    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const result = await matchEmpresaLinks(empresa);

    // Construir el patch: solo escribimos cuando hay match unívoco.
    const patch: { oneDriveUrl?: string; notionUrl?: string } = {};
    if (result.oneDrive.kind === "match") {
      patch.oneDriveUrl = result.oneDrive.item.webUrl;
    }
    if (result.notion.kind === "match") {
      patch.notionUrl = result.notion.item.url;
    }

    let updated = empresa;
    if (Object.keys(patch).length > 0) {
      updated = await prisma.empresa.update({
        where: { id },
        data: patch,
        select: {
          id: true,
          nombre: true,
          nombreComercial: true,
          oneDriveUrl: true,
          notionUrl: true,
        },
      });
      void auditLog({
        actorType: "admin",
        actorId: user?.id ?? null,
        action: "update",
        entityType: "empresa",
        entityId: id,
        before: { oneDriveUrl: empresa.oneDriveUrl, notionUrl: empresa.notionUrl },
        after: { oneDriveUrl: updated.oneDriveUrl, notionUrl: updated.notionUrl },
      });
    }

    return NextResponse.json({
      empresaId: id,
      oneDrive: result.oneDrive,
      notion: result.notion,
      empresa: {
        oneDriveUrl: updated.oneDriveUrl,
        notionUrl: updated.notionUrl,
        nombreComercial: updated.nombreComercial,
      },
    });
  } catch (e) {
    log.error("api/empresas/[id]/links/sync", e, { id: params.id });
    return NextResponse.json(
      {
        error: "Error en búsqueda automática",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
