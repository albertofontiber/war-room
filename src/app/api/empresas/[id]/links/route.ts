import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { EmpresaLinksPatchSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/empresas/[id]/links
 *
 * Actualiza la documentación externa de una empresa: link a OneDrive, link a Notion
 * y el nombre comercial usado en esos sistemas (cuando difiere del nombre legal).
 *
 * Cualquier campo se puede pasar a "" para limpiarlo (queda null en BD).
 *
 * Solo admins. Audit log captura cambios para trazabilidad.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();

    const id = parseInt(params.id, 10);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const parsed = EmpresaLinksPatchSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);

    const prev = await prisma.empresa.findUnique({
      where: { id },
      select: { oneDriveUrl: true, notionUrl: true, nombreComercial: true },
    });
    if (!prev) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    // "" → null. undefined → no tocar.
    const data: {
      oneDriveUrl?: string | null;
      notionUrl?: string | null;
      nombreComercial?: string | null;
    } = {};
    if (parsed.data.oneDriveUrl !== undefined) {
      data.oneDriveUrl = parsed.data.oneDriveUrl ? parsed.data.oneDriveUrl : null;
    }
    if (parsed.data.notionUrl !== undefined) {
      data.notionUrl = parsed.data.notionUrl ? parsed.data.notionUrl : null;
    }
    if (parsed.data.nombreComercial !== undefined) {
      data.nombreComercial = parsed.data.nombreComercial
        ? parsed.data.nombreComercial
        : null;
    }

    const empresa = await prisma.empresa.update({
      where: { id },
      data,
      select: {
        id: true,
        oneDriveUrl: true,
        notionUrl: true,
        nombreComercial: true,
      },
    });

    void auditLog({
      actorType: "admin",
      actorId: user?.id ?? null,
      action: "update",
      entityType: "empresa",
      entityId: id,
      before: prev,
      after: {
        oneDriveUrl: empresa.oneDriveUrl,
        notionUrl: empresa.notionUrl,
        nombreComercial: empresa.nombreComercial,
      },
    });

    return NextResponse.json(empresa);
  } catch (error) {
    console.error("PATCH /api/empresas/[id]/links", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
