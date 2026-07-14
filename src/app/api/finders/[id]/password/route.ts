import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinderSetPasswordSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/finders/:id/password — setea o resetea la password de un finder.
 *
 * Solo admins (sesión kind="admin") pueden llamarlo. Guarda bcrypt hash en
 * Finder.passwordHash y marca passwordSetAt = now. La password en plano solo
 * viaja en este request; luego se le pasa al finder por canal seguro.
 *
 * Devuelve { ok: true, passwordSetAt } para que el cliente pueda verificar
 * que la escritura persistió. Si passwordSetAt vuelve null, algo falló
 * silenciosamente en el pool de conexiones y el cliente debería mostrarlo
 * al admin en lugar de confiar sólo en el status HTTP.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    log.warn("api/finders/[id]/password POST", "unauthorized", {
      hasSession: !!session,
      kind: session?.kind,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = FinderSetPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const finder = await prisma.finder.findUnique({
    where: { id: params.id },
    select: { id: true, email: true },
  });
  if (!finder) return NextResponse.json({ error: "Finder not found" }, { status: 404 });

  const hash = await bcrypt.hash(parsed.data.password, 10);
  const now = new Date();

  try {
    await prisma.finder.update({
      where: { id: params.id },
      // Rotar la password invalida las sesiones vivas: subir sessionVersion
      // desincroniza los JWT emitidos con la password anterior. Coherente con
      // el aviso del modal ("la password anterior deja de funcionar").
      data: {
        passwordHash: hash,
        passwordSetAt: now,
        sessionVersion: { increment: 1 },
      },
    });
  } catch (err) {
    log.error("api/finders/[id]/password POST", err, { finderId: params.id });
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }

  // Verificación de persistencia: releemos el finder para confirmar que la
  // escritura está visible en la BD. Detecta fallos silenciosos del pool
  // (raros pero posibles en Supabase serverless).
  const verify = await prisma.finder.findUnique({
    where: { id: params.id },
    select: { passwordHash: true, passwordSetAt: true },
  });
  if (!verify?.passwordHash || !verify.passwordSetAt) {
    log.error("api/finders/[id]/password POST", "write not visible after update", {
      finderId: params.id,
      verify,
    });
    return NextResponse.json(
      { error: "Write did not persist — reintenta" },
      { status: 500 }
    );
  }

  log.info("api/finders/[id]/password POST", "password set", {
    finderId: params.id,
    email: finder.email,
    passwordSetAt: verify.passwordSetAt.toISOString(),
  });

  // Auditamos el evento (sin guardar la password ni el hash — solo el cambio).
  const user = await getCurrentUser();
  void auditLog({
    actorType: "admin",
    actorId: user?.id ?? null,
    action: "update",
    entityType: "finder",
    entityId: params.id,
    after: { passwordSetAt: verify.passwordSetAt.toISOString() },
    metadata: { event: "password_set" },
  });

  return NextResponse.json({
    ok: true,
    passwordSetAt: verify.passwordSetAt.toISOString(),
  });
}
