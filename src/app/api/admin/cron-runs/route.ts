import { NextRequest, NextResponse } from "next/server";
import { CronRunStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_VALUES = new Set(Object.values(CronRunStatus));

/**
 * Historial operativo para administradores. Los resúmenes ya se filtran al
 * escribir: contienen únicamente métricas agregadas, no datos de contactos,
 * correos, tokens ni textos de proveedores.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedLimit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const take = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 50;
  const statusParam = req.nextUrl.searchParams.get("status");
  const status = statusParam && STATUS_VALUES.has(statusParam as CronRunStatus)
    ? (statusParam as CronRunStatus)
    : undefined;

  try {
    const runs = await prisma.cronRun.findMany({
      where: status ? { status } : undefined,
      orderBy: { startedAt: "desc" },
      take,
      select: {
        id: true,
        job: true,
        source: true,
        status: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        summary: true,
        errorCode: true,
      },
    });
    return NextResponse.json({ runs });
  } catch (err) {
    log.error("api/admin/cron-runs GET", err);
    // Durante un despliegue, el código puede llegar antes que la migración.
    // Devolvemos un estado explícito en vez de una pantalla rota.
    return NextResponse.json(
      { error: "Monitoring data is not ready yet" },
      { status: 503 }
    );
  }
}
