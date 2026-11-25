import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CuentaPreferenciasSchema, zodError } from "@/lib/validation";
import { getRequestingAdmin } from "@/lib/admin-users";
import { auditLog } from "@/lib/audit-log";
import { SELECT_AVISOS_EMAIL } from "@/lib/avisos-email";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/cuenta  { emailDiario?, emailRegistros?, emailCarpetas?, emailPropuestas? }
 * Avisos por email del usuario conectado (Mi cuenta). Solo cambia los que
 * vienen en el cuerpo; devuelve todas sus preferencias.
 */
export async function PATCH(req: NextRequest) {
  const me = await getRequestingAdmin();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CuentaPreferenciasSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const updated = await prisma.user.update({
    where: { id: me.id },
    data: parsed.data,
    select: SELECT_AVISOS_EMAIL,
  });

  void auditLog({
    actorType: "admin",
    actorId: me.id,
    action: "update",
    entityType: "user",
    entityId: me.id,
    after: parsed.data,
  });

  return NextResponse.json(updated);
}
