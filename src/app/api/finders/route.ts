import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinderCreateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/finders
 * Lista de finders. Por defecto solo activos (para el selector "asignar a finder"
 * en la ficha de empresa). Pasa ?includeInactive=1 para listar también inactivos
 * (lo usa la página /finders para gestionar todos).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const includeInactive =
      new URL(req.url).searchParams.get("includeInactive") === "1";

    const finders = await prisma.finder.findMany({
      where: includeInactive ? {} : { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        commissionPct: true,
        active: true,
        passwordSetAt: true,
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    // Cache HTTP: lista de finders cambia raramente (alta/baja, edición de
    // datos). 60s + SWR de 1h reduce la latencia del selector "asignar finder"
    // que aparece en la ficha de empresa.
    return NextResponse.json(finders, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=3600",
      },
    });
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
    const user = await getCurrentUser();
    void auditLog({
      actorType: "admin",
      actorId: user?.id ?? null,
      action: "create",
      entityType: "finder",
      entityId: finder.id,
      after: {
        email: finder.email,
        name: finder.name,
        commissionPct: finder.commissionPct,
      },
    });
    return NextResponse.json(finder, { status: 201 });
  } catch (err) {
    console.error("[POST /api/finders] create failed", err);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
