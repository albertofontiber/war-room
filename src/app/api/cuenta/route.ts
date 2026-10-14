import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CuentaPreferenciasSchema, zodError } from "@/lib/validation";
import { getRequestingAdmin } from "@/lib/admin-users";
import { auditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/cuenta  { emailDiario }
 * Preferencias de avisos del usuario conectado (Mi cuenta).
 */
export async function PATCH(req: NextRequest) {
  const me = await getRequestingAdmin();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CuentaPreferenciasSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const updated = await prisma.user.update({
    where: { id: me.id },
    data: { emailDiario: parsed.data.emailDiario },
    select: { emailDiario: true },
  });

  void auditLog({
    actorType: "admin",
    actorId: me.id,
    action: "update",
    entityType: "user",
    entityId: me.id,
    after: updated,
  });

  return NextResponse.json(updated);
}
