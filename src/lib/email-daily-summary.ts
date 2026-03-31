/**
 * Daily summary email — fetches today's data and sends via Resend.
 * Called from /api/cron/daily-summary.
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

const TO = process.env.SUMMARY_EMAIL_TO ?? "alberto@fontiber.com";
const FROM = process.env.SUMMARY_EMAIL_FROM ?? "warroom@fontiber.com";
const BASE_URL = "https://warroom.fontiber.com";

// ─── Tipo labels ──────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  fusion:              "Fusión",
  adquisicion:         "Adquisición",
  posible_adquisicion: "Posible adq.",
  nombramiento:        "Nombramiento",
  nombramiento_grupo:  "Nombramiento grupo",
  cambio_denominacion: "Rebranding",
  disolucion:          "Disolución",
  otros:               "Otros",
};

const TIPO_COLOR: Record<string, string> = {
  fusion:              "#a855f7",
  adquisicion:         "#3b82f6",
  posible_adquisicion: "#f97316",
  nombramiento:        "#22c55e",
  nombramiento_grupo:  "#22c55e",
  cambio_denominacion: "#eab308",
  disolucion:          "#ef4444",
};

const STAGE_LABEL: Record<string, string> = {
  identificado:    "Identificado",
  contactado:      "Contactado",
  primera_reunion: "1ª reunión",
  analisis:        "Análisis",
  "LOI enviada":   "LOI enviada",
  execution:       "Ejecución",
  portfolio:       "Portfolio",
  muerto:          "Muerto",
};

function fmtM(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}K€`;
  return `${Math.round(v)}€`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function pill(text: string, color: string): string {
  return `<span style="display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}44">${text}</span>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function sendDailySummary(): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not set" };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // ── Fetch BORME signals created today ──────────────────────────────────────
  const bormeAlertas = await prisma.bormeAlerta.findMany({
    where: { createdAt: { gte: todayStart } },
    include: {
      empresa: {
        select: {
          nombre: true, web: true, enPerimetro: true, ccaa: true, provincia: true,
          financieros: { orderBy: { anio: "desc" }, take: 1, select: { ingresos: true, ebitda: true } },
        },
      },
      grupoInferido: { select: { nombre: true } },
    },
    orderBy: { fecha: "desc" },
  });

  // ── Fetch Pipedrive changes today ──────────────────────────────────────────
  const crmLogs = await prisma.crmLog.findMany({
    where: { createdAt: { gte: todayStart } },
    include: { empresa: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
  });

  // ── Fetch perimeter changes today ──────────────────────────────────────────
  const perimetroChanges = await prisma.empresa.findMany({
    where: { enPerimetroAt: { gte: todayStart } },
    select: { nombre: true, enPerimetro: true, ccaa: true, provincia: true },
    orderBy: { enPerimetroAt: "desc" },
  });

  // ── Check if anything happened at all ─────────────────────────────────────
  const hasContent = bormeAlertas.length > 0 || crmLogs.length > 0 || perimetroChanges.length > 0;
  if (!hasContent) {
    return { sent: false, reason: "No hay cambios hoy — email omitido" };
  }

  const today = new Date();
  const dateLabel = today.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  // ── Build HTML ─────────────────────────────────────────────────────────────
  let html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>War Room — Resumen diario</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">

  <!-- Header -->
  <tr><td style="background:#0f172a;padding:20px 28px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">⚡ War Room</span>
        <span style="font-size:13px;color:#94a3b8;margin-left:8px">Resumen diario</span></td>
      <td align="right"><span style="font-size:12px;color:#64748b">${dateCapitalized}</span></td>
    </tr></table>
  </td></tr>

  <!-- Stats bar -->
  <tr><td style="background:#1e293b;padding:10px 28px">
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:20px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:#ffffff">${bormeAlertas.length}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">señales BORME</div>
      </td>
      <td style="padding-right:20px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:#ffffff">${crmLogs.length}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">cambios CRM</div>
      </td>
      <td style="text-align:center">
        <div style="font-size:20px;font-weight:700;color:#ffffff">${perimetroChanges.length}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">cambios perímetro</div>
      </td>
    </tr></table>
  </td></tr>
`;

  // ── Section: BORME Signals ─────────────────────────────────────────────────
  if (bormeAlertas.length > 0) {
    // Compute efectiveTipo for display
    const rows = bormeAlertas.map((a) => {
      let tipo = a.tipoActo;
      if (a.tipoActo === "nombramiento_grupo") {
        // posible_adquisicion if empresa NOT in the inferred group
        const inferred = a.grupoInferido;
        if (inferred) {
          tipo = "posible_adquisicion"; // simplified — API has full logic
        }
      }
      return { ...a, displayTipo: tipo };
    });

    html += `
  <!-- BORME Signals -->
  <tr><td style="padding:20px 28px 0">
    <div style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">
      🔔 Señales BORME
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <td style="padding:6px 8px;font-size:10px;color:#64748b;font-weight:600">EMPRESA</td>
        <td style="padding:6px 8px;font-size:10px;color:#64748b;font-weight:600">TIPO</td>
        <td style="padding:6px 8px;font-size:10px;color:#64748b;font-weight:600">GRUPO</td>
        <td style="padding:6px 8px;font-size:10px;color:#64748b;font-weight:600;text-align:right">INGRESOS</td>
        <td style="padding:6px 8px;font-size:10px;color:#64748b;font-weight:600">CCAA</td>
      </tr>`;

    for (const row of rows) {
      const color = TIPO_COLOR[row.displayTipo] ?? "#64748b";
      const label = TIPO_LABEL[row.displayTipo] ?? row.displayTipo;
      const ingresos = row.empresa.financieros[0]?.ingresos ?? null;
      const isOdd = rows.indexOf(row) % 2 === 0;
      const bg = row.displayTipo === "posible_adquisicion" ? "#fff7ed" : isOdd ? "#ffffff" : "#f8fafc";

      html += `
      <tr style="background:${bg};border-bottom:1px solid #e2e8f0">
        <td style="padding:7px 8px;font-size:12px;color:#0f172a;font-weight:500">
          ${row.empresa.nombre}
          ${row.empresa.enPerimetro ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#3b82f6;margin-left:4px;vertical-align:middle"></span>' : ""}
        </td>
        <td style="padding:7px 8px">${pill(label, color)}</td>
        <td style="padding:7px 8px;font-size:11px;color:#3b82f6">${row.grupoInferido?.nombre ?? "—"}</td>
        <td style="padding:7px 8px;font-size:11px;color:#374151;text-align:right;font-variant-numeric:tabular-nums">${fmtM(ingresos)}</td>
        <td style="padding:7px 8px;font-size:11px;color:#64748b">${row.empresa.ccaa ?? "—"}</td>
      </tr>`;
    }

    html += `
    </table>
    <div style="padding:8px 0 0">
      <a href="${BASE_URL}" style="font-size:11px;color:#3b82f6;text-decoration:none">Ver todas en War Room →</a>
    </div>
  </td></tr>`;
  }

  // ── Section: Pipedrive Changes ─────────────────────────────────────────────
  if (crmLogs.length > 0) {
    html += `
  <!-- Pipedrive -->
  <tr><td style="padding:20px 28px 0">
    <div style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">
      📋 Cambios Pipedrive
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <td style="padding:6px 8px;font-size:10px;color:#64748b;font-weight:600">EMPRESA</td>
        <td style="padding:6px 8px;font-size:10px;color:#64748b;font-weight:600">EVENTO</td>
        <td style="padding:6px 8px;font-size:10px;color:#64748b;font-weight:600">OWNER</td>
      </tr>`;

    for (const log of crmLogs) {
      const isNew = log.event === "new_deal";
      const eventHtml = isNew
        ? `<span style="color:#22c55e;font-weight:600;font-size:11px">Nuevo deal</span> → ${pill(STAGE_LABEL[log.toStage ?? ""] ?? log.toStage ?? "—", "#22c55e")}`
        : `${pill(STAGE_LABEL[log.fromStage ?? ""] ?? log.fromStage ?? "—", "#94a3b8")} → ${pill(STAGE_LABEL[log.toStage ?? ""] ?? log.toStage ?? "—", "#3b82f6")}`;
      const isOdd = crmLogs.indexOf(log) % 2 === 0;

      html += `
      <tr style="background:${isOdd ? "#ffffff" : "#f8fafc"};border-bottom:1px solid #e2e8f0">
        <td style="padding:7px 8px;font-size:12px;color:#0f172a;font-weight:500">${log.empresa.nombre}</td>
        <td style="padding:7px 8px">${eventHtml}</td>
        <td style="padding:7px 8px;font-size:11px;color:#64748b">${log.owner ?? "—"}</td>
      </tr>`;
    }

    html += `
    </table>
  </td></tr>`;
  }

  // ── Section: Perimeter Changes ─────────────────────────────────────────────
  if (perimetroChanges.length > 0) {
    const added = perimetroChanges.filter((e) => e.enPerimetro);
    const removed = perimetroChanges.filter((e) => !e.enPerimetro);

    html += `
  <!-- Perímetro -->
  <tr><td style="padding:20px 28px 0">
    <div style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">
      ⭕ Cambios perímetro
    </div>`;

    if (added.length > 0) {
      html += `<div style="font-size:11px;color:#22c55e;font-weight:600;margin-bottom:6px">Añadidas al perímetro (${added.length})</div>`;
      html += `<ul style="margin:0 0 10px;padding-left:18px">`;
      for (const e of added) {
        html += `<li style="font-size:12px;color:#0f172a;margin-bottom:2px">${e.nombre} <span style="color:#94a3b8">${e.ccaa ?? e.provincia ?? ""}</span></li>`;
      }
      html += `</ul>`;
    }

    if (removed.length > 0) {
      html += `<div style="font-size:11px;color:#ef4444;font-weight:600;margin-bottom:6px">Retiradas del perímetro (${removed.length})</div>`;
      html += `<ul style="margin:0 0 10px;padding-left:18px">`;
      for (const e of removed) {
        html += `<li style="font-size:12px;color:#6b7280;margin-bottom:2px">${e.nombre} <span style="color:#94a3b8">${e.ccaa ?? e.provincia ?? ""}</span></li>`;
      }
      html += `</ul>`;
    }

    html += `</td></tr>`;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  html += `
  <!-- Divider -->
  <tr><td style="padding:24px 28px 0"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0"></td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 28px 24px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:11px;color:#94a3b8">
        Resumen generado automáticamente — <a href="${BASE_URL}" style="color:#3b82f6;text-decoration:none">warroom.fontiber.com</a>
      </td>
      <td align="right" style="font-size:11px;color:#cbd5e1">
        ${fmtDate(today)}
      </td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;

  // ── Send ───────────────────────────────────────────────────────────────────
  const { error } = await resend.emails.send({
    from: `War Room <${FROM}>`,
    to: TO.split(",").map((s) => s.trim()),
    subject: `⚡ War Room — ${dateCapitalized}`,
    html,
  });

  if (error) {
    console.error("[daily-summary] Resend error:", error);
    return { sent: false, reason: String(error) };
  }

  return { sent: true };
}
