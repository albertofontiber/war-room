/**
 * /api/cron/task-digest
 * Vercel cron — días laborables a las 07:00 UTC (≈ 8 Madrid invierno / 9 Madrid verano).
 * Envía un email a cada usuario activo con sus tareas: vencidas, hoy, próximos 7 días.
 *
 * Query params para testing:
 *   ?to=email1,email2  — fuerza destinatarios (redirige todos los digests a esas direcciones)
 *   ?force=true        — envía también cuando el usuario no tiene tareas
 */

import { NextRequest, NextResponse } from "next/server";
import { sendTaskDigest } from "@/lib/email-task-digest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const to = req.nextUrl.searchParams.get("to") ?? undefined;
    const force = req.nextUrl.searchParams.get("force") === "true";
    const result = await sendTaskDigest({ to, force });
    console.log("[task-digest]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[task-digest] Fatal error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
