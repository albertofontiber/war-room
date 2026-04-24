import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinderSetPasswordSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/finders/:id/password — setea o resetea la password de un finder.
 *
 * Solo admins (sesión kind="admin") pueden llamarlo. Guarda bcrypt hash en
 * Finder.passwordHash y marca passwordSetAt = now. La password en plano solo
 * viaja en este request; luego se le pasa al finder por canal seguro.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = FinderSetPasswordSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);

  const finder = await prisma.finder.findUnique({ where: { id: params.id } });
  if (!finder) return NextResponse.json({ error: "Finder not found" }, { status: 404 });

  const hash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.finder.update({
    where: { id: params.id },
    data: { passwordHash: hash, passwordSetAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
