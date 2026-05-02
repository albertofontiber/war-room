import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createEmpresaLinks } from "@/lib/empresa-link-builder";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/empresas/[id]/links/create
 *
 * Crea AUTOMÁTICAMENTE carpeta OneDrive (`[N+1]. Nombre` con subcarpetas
 * Analyses/NDA/IRL) + página Notion bajo `Targets`. Pobla `oneDriveUrl` y
 * `notionUrl` en la empresa.
 *
 * Solo permite crear si la empresa NO tiene URLs ya — para no duplicar.
 *
 * Llamado desde:
 *   - Botón "Crear carpeta y página" del PanelEmpresa.
 *   - Trigger automático en PATCH /api/empresas/[id]/stage cuando una empresa
 *     entra a `primera_reunion` por primera vez.
 *   - Cron semanal /api/cron/target-docs-check como fallback.
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
        oneDriveUrl: true,
        notionUrl: true,
      },
    });
    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    // Guard: si ya tiene URLs, no recreamos. El caller decide qué hacer.
    if (empresa.oneDriveUrl || empresa.notionUrl) {
      return NextResponse.json(
        {
          error: "La empresa ya tiene links. Edítalos manualmente o usa /sync.",
          oneDriveUrl: empresa.oneDriveUrl,
          notionUrl: empresa.notionUrl,
        },
        { status: 409 }
      );
    }

    const created = await createEmpresaLinks(empresa.nombre);

    const updated = await prisma.empresa.update({
      where: { id },
      data: {
        oneDriveUrl: created.oneDriveUrl,
        notionUrl: created.notionUrl,
      },
      select: {
        id: true,
        oneDriveUrl: true,
        notionUrl: true,
      },
    });

    void auditLog({
      actorType: "admin",
      actorId: user?.id ?? null,
      action: "create",
      entityType: "empresa",
      entityId: id,
      before: null,
      after: {
        oneDriveUrl: updated.oneDriveUrl,
        notionUrl: updated.notionUrl,
        folderName: created.folder.name,
      },
    });

    return NextResponse.json({
      ok: true,
      folder: created.folder,
      page: created.page,
      empresa: updated,
    });
  } catch (e) {
    log.error("api/empresas/[id]/links/create", e, { id: params.id });
    return NextResponse.json(
      {
        error: "Error creando carpeta y página",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
