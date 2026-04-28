import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinderCreateSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/finders
 * Lista de finders activos. Usado para el selector de "asignar a finder" en la ficha
 * de empresa. También lo consumirá en el futuro `/admin/finders` cuando se cree.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const finders = await prisma.finder.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        commissionPct: true,
        passwordSetAt: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(finders);
  } catch (err) {
    console.error("[GET /api/finders]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/finders
 * Crea un nuevo finder con email, nombre, comisión opcional y password inicial.
 * Solo admins. Email único — devuelve 409 si ya existe (incluido si está active=false).
 *
 * El password se hashea con bcrypt y se persiste en passwordHash + passwordSetAt
 * en la misma operación. La contraseña en plano solo viaja en este request.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = FinderCreateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const { email, name, commissionPct, password } = parsed.data;

  const existing = await prisma.finder.findUnique({
    where: { email },
    select: { id: true, active: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un finder con ese email" },
      { status: 409 }
    );
  }

  const hash = await bcrypt.hash(password, 10);
  const now = new Date();

  try {
    const finder = await prisma.finder.create({
      data: {
        email,
        name: name.trim(),
        commissionPct: commissionPct ?? null,
        passwordHash: hash,
        passwordSetAt: now,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        commissionPct: true,
        passwordSetAt: true,
      },
    });
    console.log("[POST /api/finders] created", { id: finder.id, email: finder.email });
    return NextResponse.json(finder, { status: 201 });
  } catch (err) {
    console.error("[POST /api/finders] create failed", err);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
