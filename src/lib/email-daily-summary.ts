/**
 * Daily summary email — fetches today's data and sends a minimal email
 * with stats + a link to the full summary page at /daily/[fecha].
 *
 * Called from /api/cron/daily-summary.
 * The full styled summary lives at warroom.fontiber.com/daily/YYYY-MM-DD.
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const TO       = process.env.SUMMARY_EMAIL_TO   ?? "alberto@fontiber.com,gabriel@fontiber.com";
const FROM     = process.env.SUMMARY_EMAIL_FROM ?? "warroom@fontiber.com";
const BASE_URL = "https://warroom.fontiber.com";

// ─── Main export ──────────────────────────────────────────────────────────────
export async function sendDailySummary(
  options?: { since?: Date; force?: boolean; to?: string }
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not set" };
  const resend = new Resend(apiKey);

  // By default query from yesterday midnight — the cron runs at 08:00 (06:00 UTC)
  // the morning after BORME and Pipedrive have updated (previous evening).
  const todayStart = options?.since ?? (() => {
    const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d;
  })();

  // ── 1. BORME alerts (solo empresas en perímetro) ────────────────────────────
  const bormeAlertas = await prisma.bormeAlerta.findMany({
    where: {
      createdAt: { gte: todayStart },
      empresa:   { enPerimetro: true },
    },
    include: {
      empresa:       { select: { enPerimetro: true } },
      grupoInferido: { select: { nombre: true } },
    },
  });

  // ── 2. Personas: today, ≥2 companies, ≥1 in perimeter ─────────────────────
  const todayPersonaAlertas = bormeAlertas.filter(
    (a) => a.tipoActo === "nombramiento" || a.tipoActo === "nombramiento_grupo"
  );
  const personasHoy = Array.from(new Set(
    todayPersonaAlertas.map((a) => a.personaDetectada).filter(Boolean) as string[]
  ));

  let personaAlertCount = 0;
  if (personasHoy.length > 0) {
    const historial = await prisma.bormeAlerta.findMany({
      where: { tipoActo: { in: ["nombramiento", "nombramiento_grupo"] }, personaDetectada: { in: personasHoy } },
      include: { empresa: { select: { id: true, enPerimetro: true } } },
    });
    const byPersona = new Map<string, typeof historial>();
    for (const a of historial) {
      if (!byPersona.has(a.personaDetectada!)) byPersona.set(a.personaDetectada!, []);
      byPersona.get(a.personaDetectada!)!.push(a);
    }
    for (const [, apariciones] of Array.from(byPersona.entries())) {
      const byEmpresa = new Map<number, (typeof apariciones)[number]>();
      for (const a of apariciones) {
        if (!byEmpresa.has(a.empresaId)) byEmpresa.set(a.empresaId, a);
      }
      const empresas = Array.from(byEmpresa.values());
      if (empresas.length >= 2 && empresas.some((a) => a.empresa.enPerimetro)) {
        personaAlertCount++;
      }
    }
  }

  // ── Counts ─────────────────────────────────────────────────────────────────
  const DETAIL_TIPOS = new Set(["fusion", "adquisicion", "posible_adquisicion"]);
  const detailCount = bormeAlertas.filter((a) => {
    const tipo = a.tipoActo === "nombramiento_grupo" && a.grupoInferido
      ? "posible_adquisicion"
      : a.tipoActo;
    return DETAIL_TIPOS.has(tipo);
  }).length;

  // ── Date strings ───────────────────────────────────────────────────────────
  const today = todayStart;
  const fechaParam = today.toISOString().slice(0, 10); // YYYY-MM-DD
  const dateLabel = today.toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const pageUrl = `${BASE_URL}/daily/${fechaParam}`;

  // ── Build minimal HTML email ───────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>War Room — Resumen diario</title>
  <style>
    body { margin:0; padding:0; background:#f5f5f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f5f5f5">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">

          <!-- Header -->
          <tr>
            <td style="padding:20px 28px 16px;border-bottom:1px solid #e5e7eb">
              <div style="font-size:11px;font-weight:800;color:#111827;letter-spacing:2px;text-transform:uppercase">FONTIBER WAR ROOM</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:2px">${dateCapitalized}</div>
            </td>
          </tr>

          <!-- Stats -->
          <tr>
            <td style="padding:24px 28px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="text-align:center;padding:0 12px 0 0;border-right:1px solid #e5e7eb">
                    <div style="font-size:32px;font-weight:700;color:#111827;line-height:1">${bormeAlertas.length}</div>
                    <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;margin-top:6px">Señales BORME</div>
                  </td>
                  <td width="33%" style="text-align:center;padding:0 12px;border-right:1px solid #e5e7eb">
                    <div style="font-size:32px;font-weight:700;color:${detailCount > 0 ? "#f97316" : "#111827"};line-height:1">${detailCount}</div>
                    <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;margin-top:6px">Fus./Adq./Posible</div>
                  </td>
                  <td width="33%" style="text-align:center;padding:0 0 0 12px">
                    <div style="font-size:32px;font-weight:700;color:${personaAlertCount > 0 ? "#0ea5e9" : "#111827"};line-height:1">${personaAlertCount}</div>
                    <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;margin-top:6px">Alertas personas</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 28px 28px;text-align:center">
              <a href="${pageUrl}"
                 style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px;letter-spacing:.2px">
                Ver resumen completo &rarr;
              </a>
              <div style="margin-top:12px;font-size:11px;color:#9ca3af">
                <a href="${pageUrl}" style="color:#6b7280;text-decoration:none">${pageUrl}</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:14px 28px;border-top:1px solid #e5e7eb;background:#f9fafb">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:10px;color:#9ca3af">
                    <a href="${BASE_URL}" style="color:#3b82f6;text-decoration:none;font-weight:600">warroom.fontiber.com</a>
                    &nbsp;&middot;&nbsp;Fontiber Industrial Partners
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Send ───────────────────────────────────────────────────────────────────
  const { error } = await resend.emails.send({
    from: `War Room <${FROM}>`,
    to: (options?.to ?? TO).split(",").map((s) => s.trim()),
    subject: `⚡ War Room — ${dateCapitalized}`,
    html,
  });

  if (error) {
    console.error("[daily-summary] Resend error:", error);
    return { sent: false, reason: String(error) };
  }

  return { sent: true };
}
