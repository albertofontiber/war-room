import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePersona } from "@/lib/normalize";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/proposals?status=PENDING&finderId=...
 *
 * Lista de propuestas hechas por los finders. Por defecto solo PENDING.
 * Solo admins. Incluye la identidad del finder que propuso.
 *
 * Para cada propuesta calcula `dedupMatch: {nombre, cif} | null` on-the-fly
 * comparando contra la BD (CIF exacto + nombre normalizado). No persistimos
 * el match en la propia TargetProposal para evitar estado obsoleto si la
 * empresa aparece/desaparece de la BD entre la propuesta y la revisión.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const finderId = url.searchParams.get("finderId");

  const proposals = await prisma.targetProposal.findMany({
    where: {
      ...(status === "ALL" ? {} : { status: status as "PENDING" | "ACCEPTED" | "DUPLICATE" | "OUT_OF_SCOPE" | "REJECTED" }),
      ...(finderId ? { finderId } : {}),
    },
    include: {
      finder: { select: { id: true, name: true, email: true } },
      empresa: { select: { id: true, nombre: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Calcular dedupMatch para las que son PENDING (o mostrarlo siempre si el
  // admin está viendo histórico): cargamos el universo de empresas no
  // anónimas una sola vez y matcheamos por CIF exacto o nombre normalizado.
  const empresas = await prisma.empresa.findMany({
    where: { esAnonima: false },
    select: { id: true, nombre: true, cif: true },
  });
  const byCif = new Map(empresas.map((e) => [e.cif.toUpperCase(), e]));
  const byNorm = new Map<string, typeof empresas[number]>();
  for (const e of empresas) {
    const key = normalizePersona(e.nombre, true);
    if (key.length >= 3 && !byNorm.has(key)) byNorm.set(key, e);
  }

  const enriched = proposals.map((p) => {
    let dedupMatch: { id: number; nombre: string; cif: string } | null = null;
    if (p.cif) {
      const m = byCif.get(p.cif.toUpperCase());
      if (m) dedupMatch = { id: m.id, nombre: m.nombre, cif: m.cif };
    }
    if (!dedupMatch) {
      const key = normalizePersona(p.companyName, true);
      if (key.length >= 3) {
        const m = byNorm.get(key);
        if (m) dedupMatch = { id: m.id, nombre: m.nombre, cif: m.cif };
      }
    }
    return { ...p, dedupMatch };
  });

  return NextResponse.json(enriched);
}
