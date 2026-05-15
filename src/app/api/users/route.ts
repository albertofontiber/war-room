import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * GET /api/users?role=admin
 * Lista de usuarios activos filtrada por rol (default: admin). Usado para los
 * selectores de "asignado a" y "owner" en la UI.
 *
 * Cache HTTP: la lista cambia raramente — 5 min de cache + 1h SWR.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = new URL(req.url).searchParams.get("role") ?? "admin";

    const users = await prisma.user.findMany({
      where: { active: true, role },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    // Sin Cache-Control: el listado de admins se muta desde la UI (crear,
    // editar, desactivar) y cualquier max-age provoca que el navegador
    // sirva una lista vieja tras la mutación. La latencia de Prisma local
    // (<50ms) es despreciable comparada con el coste de un bug "tengo que
    // pulsar F5". Si en el futuro hace falta cache, hacerlo invalidable
    // por el bus `wr:data-changed`, no por TTL.
    return NextResponse.json(users);
  } catch (err) {
    log.error("api/users GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
