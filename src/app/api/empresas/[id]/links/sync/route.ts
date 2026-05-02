import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/empresas/[id]/links/sync
 *
 * Búsqueda automática de carpeta OneDrive y página Notion para la empresa,
 * usando matching por nombre normalizado o `nombreComercial`. Popula
 * `oneDriveUrl` y `notionUrl` cuando hay match unívoco.
 *
 * STUB hasta que se completen las credenciales:
 *   - Microsoft Graph API: requiere AZURE_TENANT_ID, AZURE_CLIENT_ID,
 *     AZURE_CLIENT_SECRET, ONEDRIVE_OWNER_UPN, ONEDRIVE_TARGETS_PATH.
 *   - Notion API: requiere NOTION_API_KEY, NOTION_TARGETS_PAGE_ID.
 *
 * El cuerpo del matcher (cascada normalize → Claude → ambiguo) llega en una
 * sesión posterior una vez el setup esté listo. Hoy devolvemos 501 con un
 * mensaje claro para que la UI muestre el estado correcto.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const missing: string[] = [];
  if (!process.env.AZURE_CLIENT_ID) missing.push("AZURE_CLIENT_ID");
  if (!process.env.AZURE_CLIENT_SECRET) missing.push("AZURE_CLIENT_SECRET");
  if (!process.env.AZURE_TENANT_ID) missing.push("AZURE_TENANT_ID");
  if (!process.env.NOTION_API_KEY) missing.push("NOTION_API_KEY");

  return NextResponse.json(
    {
      error: "Sync no implementado todavía",
      reason:
        missing.length > 0
          ? `Faltan credenciales: ${missing.join(", ")}`
          : "Pendiente de implementación del matcher en próxima sesión",
      missingEnvVars: missing,
    },
    { status: 501 }
  );
}
