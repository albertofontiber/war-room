/**
 * GET /api/menciones/candidatos?empresaId=123
 *
 * Devuelve la lista de candidatos a mencionar desde el editor de notas/tareas
 * en la ficha de la empresa indicada. Visibilidad para admins:
 *   - Todos los admins activos (User.role="admin", active=true).
 *   - El finder asignado al deal (Empresa.finderSourceId), si lo hay.
 *
 * Respuesta: `[{kind: "u"|"f", id, name}]`. Sin emails — el cliente no los
 * necesita para el autocomplete y se evita exponerlos a quien no debería.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user-from-session";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const empresaIdRaw = req.nextUrl.searchParams.get("empresaId");
    const empresaId = empresaIdRaw ? Number(empresaIdRaw) : null;
    if (!empresaId || !Number.isFinite(empresaId)) {
      return NextResponse.json({ error: "Invalid empresaId" }, { status: 400 });
    }

    const [admins, empresa] = await Promise.all([
      prisma.user.findMany({
        where: { role: "admin", active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { finderSource: { select: { id: true, name: true, active: true } } },
      }),
    ]);

    type Candidato = { kind: "u" | "f"; id: string; name: string };
    const result: Candidato[] = admins.map((a) => ({ kind: "u", id: a.id, name: a.name }));

    if (empresa?.finderSource && empresa.finderSource.active) {
      result.push({
        kind: "f",
        id: empresa.finderSource.id,
        name: empresa.finderSource.name,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    log.error("api/menciones/candidatos GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
