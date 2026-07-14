import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { ContactoUpdateSchema, zodError } from "@/lib/validation";
import { auditLog, diffFields } from "@/lib/audit-log";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/contactos/[id]
 * Body parcial: cualquier subconjunto de { nombre, cargo, email, telefono, notas }.
 * Solo admins (kind="admin").
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contactoId = Number(params.id);
    if (!Number.isFinite(contactoId)) {
      return NextResponse.json({ error: "Invalid contacto id" }, { status: 400 });
    }

    const parsed = ContactoUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);

    const prev = await prisma.contacto.findUnique({ where: { id: contactoId } });
    if (!prev) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = parsed.data;
    // Normalización: email "" → null en BD para que el matcher no falle al
    // comparar strings vacíos como recipient.
    const updatePayload = {
      ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
      ...(data.cargo !== undefined ? { cargo: data.cargo ?? null } : {}),
      ...(data.email !== undefined
        ? { email: data.email && data.email.length > 0 ? data.email : null }
        : {}),
      ...(data.telefono !== undefined ? { telefono: data.telefono ?? null } : {}),
      ...(data.notas !== undefined ? { notas: data.notas ?? null } : {}),
    };

    const contacto = await prisma.contacto.update({
      where: { id: contactoId },
      data: updatePayload,
    });

    const diff = diffFields(prev as Record<string, unknown>, {
      nombre: contacto.nombre,
      cargo: contacto.cargo,
      email: contacto.email,
      telefono: contacto.telefono,
      notas: contacto.notas,
    });
    if (Object.keys(diff.before).length > 0) {
      void auditLog({
        actorType: "admin",
        actorId: user.id,
        action: "update",
        entityType: "contacto",
        entityId: contactoId,
        before: diff.before,
        after: diff.after,
      });
    }

    return NextResponse.json(contacto);
  } catch (err) {
    log.error("api/contactos/[id] PATCH", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/contactos/[id]
 * Solo admins (kind="admin").
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contactoId = Number(params.id);
    if (!Number.isFinite(contactoId)) {
      return NextResponse.json({ error: "Invalid contacto id" }, { status: 400 });
    }

    const prev = await prisma.contacto.findUnique({ where: { id: contactoId } });
    if (!prev) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.contacto.delete({ where: { id: contactoId } });

    void auditLog({
      actorType: "admin",
      actorId: user.id,
      action: "delete",
      entityType: "contacto",
      entityId: contactoId,
      before: {
        empresaId: prev.empresaId,
        nombre: prev.nombre,
        cargo: prev.cargo,
        email: prev.email,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("api/contactos/[id] DELETE", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
