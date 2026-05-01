import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinderUpdateSchema, zodError } from "@/lib/validation";
import { auditLog, diffFields } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/finders/:id
 *
 * Edita un finder existente. Solo admins. Campos editables:
 *   - email     (único — devuelve 409 si choca con otro finder)
 *   - name
 *   - commissionPct
 *   - active    (toggle activo/inactivo; un finder inactivo no puede loguearse
 *                en el portal aunque tenga passwordHash, ver auth.ts)
 *
 * NO toca passwordHash ni passwordSetAt. Para eso, POST /api/finders/:id/password.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = FinderUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;

  const finder = await prisma.finder.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, name: true, commissionPct: true, active: true },
  });
  if (!finder) return NextResponse.json({ error: "Finder not found" }, { status: 404 });

  // Si se cambia el email, validar unicidad antes de tocar la BD.
  if (data.email && data.email !== finder.email) {
    const collision = await prisma.finder.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (collision && collision.id !== params.id) {
      return NextResponse.json(
        { error: "Ya existe otro finder con ese email" },
        { status: 409 }
      );
    }
  }

  try {
    const updated = await prisma.finder.update({
      where: { id: params.id },
      data: {
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.commissionPct !== undefined
          ? { commissionPct: data.commissionPct }
          : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        commissionPct: true,
        active: true,
        passwordSetAt: true,
      },
    });
    console.log("[PATCH /api/finders/:id] updated", {
      id: params.id,
      changes: Object.keys(data),
    });
    const user = await getCurrentUser();
    const diff = diffFields(
      { email: finder.email, name: finder.name, commissionPct: finder.commissionPct, active: finder.active },
      { email: updated.email, name: updated.name, commissionPct: updated.commissionPct, active: updated.active },
    );
    if (Object.keys(diff.after).length > 0) {
      void auditLog({
        actorType: "admin",
        actorId: user?.id ?? null,
        action: "update",
        entityType: "finder",
        entityId: params.id,
        before: diff.before,
        after: diff.after,
      });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/finders/:id] update failed", err);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
