import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { ContactoCreateSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/empresas/[id]/contactos
 * Lista de contactos de la empresa, ordenados por nombre.
 * Solo admins (kind="admin").
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const contactos = await prisma.contacto.findMany({
      where: { empresaId },
      orderBy: [{ nombre: "asc" }],
    });
    return NextResponse.json(contactos);
  } catch (err) {
    log.error("api/empresas/[id]/contactos GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/empresas/[id]/contactos
 * Body: { nombre, cargo?, email?, telefono?, notas? }
 * Crea un contacto. El email se normaliza a lowercase en el zod schema para
 * que el matcher del shared inbox sea case-insensitive sin lookups extra.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaId = Number(params.id);
    if (!Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresa id" }, { status: 400 });
    }

    const parsed = ContactoCreateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);

    const { nombre, cargo, email, telefono, notas } = parsed.data;
    const contacto = await prisma.contacto.create({
      data: {
        empresaId,
        nombre,
        cargo: cargo ?? null,
        email: email && email.length > 0 ? email : null,
        telefono: telefono ?? null,
        notas: notas ?? null,
      },
    });
    void auditLog({
      actorType: "admin",
      actorId: user.id,
      action: "create",
      entityType: "contacto",
      entityId: contacto.id,
      after: {
        empresaId,
        nombre: contacto.nombre,
        cargo: contacto.cargo,
        email: contacto.email,
      },
    });
    return NextResponse.json(contacto, { status: 201 });
  } catch (err) {
    log.error("api/empresas/[id]/contactos POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
