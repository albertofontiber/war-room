/**
 * Daily summary email — fetches today's data and sends via Resend.
 * Called from /api/cron/daily-summary.
 *
 * Sections:
 *  1. Señales M&A — summary pills + detail table (fusión/adquisición/posible adq.)
 *                   + static Mapbox map of in-perimeter companies with alerts
 *  2. Alertas personas — people who today appear in ≥2 companies, ≥1 in perimeter
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const TO       = process.env.SUMMARY_EMAIL_TO   ?? "alberto@fontiber.com";
const FROM     = process.env.SUMMARY_EMAIL_FROM ?? "warroom@fontiber.com";
const BASE_URL = "https://warroom.fontiber.com";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       "#080e18",
  surface:  "#0f172a",
  surface2: "#141f35",
  surface3: "#1a2540",
  border:   "#1e2d45",
  text:     "#e2e8f0",
  muted:    "#94a3b8",
  hint:     "#475569",
  blue:     "#3b82f6",
  sky:      "#38bdf8",
  green:    "#22c55e",
  amber:    "#f59e0b",
  orange:   "#f97316",
  red:      "#ef4444",
  violet:   "#8b5cf6",
};

// ─── Config ───────────────────────────────────────────────────────────────────
const DETAIL_TIPOS = new Set(["fusion", "adquisicion", "posible_adquisicion"]);

const TIPO_LABEL: Record<string, string> = {
  fusion:              "Fusión",
  adquisicion:         "Adquisición",
  posible_adquisicion: "Posible adq.",
  nombramiento:        "Nombramiento",
  nombramiento_grupo:  "Nom. grupo",
  cambio_denominacion: "Rebranding",
  disolucion:          "Disolución",
  otros:               "Otros",
};

const TIPO_COLOR: Record<string, string> = {
  fusion:              C.violet,
  adquisicion:         C.blue,
  posible_adquisicion: C.orange,
  nombramiento:        C.green,
  nombramiento_grupo:  C.green,
  cambio_denominacion: C.amber,
  disolucion:          C.red,
  otros:               C.hint,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtM(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`;
  if (Math.abs(v) >= 1_000)     return `${Math.round(v / 1_000)}K€`;
  return `${Math.round(v)}€`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function pill(text: string, color: string, small = false): string {
  const sz = small ? "9px" : "10px";
  return `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:${sz};font-weight:700;letter-spacing:.3px;background:${color}22;color:${color};border:1px solid ${color}44;white-space:nowrap">${text}</span>`;
}

function tdH(text: string, align = "left"): string {
  return `<td style="padding:7px 10px;font-size:9px;font-weight:700;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;text-align:${align};background:${C.surface3};border-bottom:1px solid ${C.border}">${text}</td>`;
}

// ─── Mapbox static map ────────────────────────────────────────────────────────
function buildMapUrl(coords: Array<[number, number]>): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || coords.length === 0) return null;

  // Orange pin for each in-perimeter company with BORME alert
  const markers = coords
    .slice(0, 60)
    .map(([lng, lat]) => `pin-s+f97316(${lng.toFixed(4)},${lat.toFixed(4)})`)
    .join(",");

  const bounds = coords.length === 1
    ? `${coords[0][0].toFixed(4)},${coords[0][1].toFixed(4)},7`
    : "auto";

  const padding = coords.length > 1 ? "&padding=60" : "";
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${markers}/${bounds}/560x240@2x?access_token=${token}${padding}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function sendDailySummary(
  options?: { since?: Date; force?: boolean }
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not set" };
  const resend = new Resend(apiKey);

  const todayStart = options?.since ?? (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  })();

  // ── 1. BORME alerts created today ──────────────────────────────────────────
  const bormeAlertas = await prisma.bormeAlerta.findMany({
    where: { createdAt: { gte: todayStart } },
    include: {
      empresa: {
        select: {
          nombre: true, web: true, enPerimetro: true, ccaa: true, provincia: true,
          lat: true, lng: true,
          financieros: { orderBy: { anio: "desc" }, take: 1, select: { ingresos: true, ebitda: true, margenBruto: true } },
        },
      },
      grupoInferido: { select: { nombre: true } },
    },
    orderBy: [{ fecha: "desc" }],
  });

  // ── 2. Personas: new today, appearing in ≥2 companies, ≥1 in perimeter ─────
  const todayPersonaAlertas = bormeAlertas.filter(
    (a) => a.tipoActo === "nombramiento" || a.tipoActo === "nombramiento_grupo"
  );
  const personasHoy = Array.from(new Set(
    todayPersonaAlertas.map((a) => a.personaDetectada).filter(Boolean) as string[]
  ));

  const alertaPersonas: Array<{
    nombre: string;
    empresas: Array<{ empresaNombre: string; enPerimetro: boolean; rol: string | null; fecha: Date; ingresos: number | null }>;
  }> = [];

  if (personasHoy.length > 0) {
    const historial = await prisma.bormeAlerta.findMany({
      where: {
        tipoActo: { in: ["nombramiento", "nombramiento_grupo"] },
        personaDetectada: { in: personasHoy },
      },
      include: {
        empresa: {
          select: {
            id: true, nombre: true, enPerimetro: true,
            financieros: { orderBy: { anio: "desc" }, take: 1, select: { ingresos: true } },
          },
        },
      },
      orderBy: { fecha: "desc" },
    });

    // Group by person → deduplicate by company
    const byPersona = new Map<string, typeof historial>();
    for (const a of historial) {
      if (!byPersona.has(a.personaDetectada!)) byPersona.set(a.personaDetectada!, []);
      byPersona.get(a.personaDetectada!)!.push(a);
    }

    for (const [nombre, apariciones] of Array.from(byPersona.entries())) {
      // Deduplicate: one row per company (most recent appearance)
      const byEmpresa = new Map<number, typeof apariciones[number]>();
      for (const a of apariciones) {
        if (!byEmpresa.has(a.empresaId)) byEmpresa.set(a.empresaId, a);
      }
      const empresas = Array.from(byEmpresa.values());
      // Filter: ≥2 companies AND ≥1 in perimeter
      if (empresas.length >= 2 && empresas.some((a) => a.empresa.enPerimetro)) {
        alertaPersonas.push({
          nombre,
          empresas: empresas.map((a) => ({
            empresaNombre: a.empresa.nombre,
            enPerimetro: a.empresa.enPerimetro,
            rol: null, // rol not stored separately yet
            fecha: a.fecha,
            ingresos: a.empresa.financieros[0]?.ingresos ?? null,
          })),
        });
      }
    }
  }

  const hasContent = bormeAlertas.length > 0 || alertaPersonas.length > 0;
  if (!hasContent && !options?.force) {
    return { sent: false, reason: "No hay cambios hoy — email omitido" };
  }

  // ── Compute efectiveTipo + summary counts ──────────────────────────────────
  const rows = bormeAlertas.map((a) => {
    let tipo = a.tipoActo;
    if (a.tipoActo === "nombramiento_grupo" && a.grupoInferido) tipo = "posible_adquisicion";
    return { ...a, displayTipo: tipo };
  });

  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.displayTipo] = (counts[r.displayTipo] ?? 0) + 1;
  }

  const detailRows = rows.filter((r) => DETAIL_TIPOS.has(r.displayTipo));

  // Map: in-perimeter companies with today's BORME alerts
  const mapCoords: Array<[number, number]> = bormeAlertas
    .filter((a) => a.empresa.enPerimetro && a.empresa.lng != null && a.empresa.lat != null)
    .map((a) => [a.empresa.lng!, a.empresa.lat!] as [number, number]);

  const mapUrl = buildMapUrl(mapCoords);

  // ── Build HTML ─────────────────────────────────────────────────────────────
  const today = new Date();
  const dateLabel = today.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  let html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>War Room — Resumen diario</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${C.text};-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.bg};padding:28px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.surface};border-radius:10px;overflow:hidden;border:1px solid ${C.border}">

  <!-- Header -->
  <tr><td style="padding:20px 28px 16px;border-bottom:1px solid ${C.border}">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td>
        <div style="font-size:12px;font-weight:800;color:${C.text};letter-spacing:1.8px;text-transform:uppercase">FONTIBER WAR ROOM</div>
        <div style="font-size:10px;color:${C.hint};margin-top:2px;letter-spacing:.3px">Resumen diario · M&amp;A Intelligence</div>
      </td>
      <td align="right" style="font-size:11px;color:${C.hint}">${dateCapitalized}</td>
    </tr></table>
  </td></tr>

  <!-- Stats bar -->
  <tr><td style="background:${C.surface2};padding:14px 28px;border-bottom:1px solid ${C.border}">
    <table cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td style="padding-right:24px">
        <div style="font-size:20px;font-weight:700;color:${C.text}">${bormeAlertas.length}</div>
        <div style="font-size:9px;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;margin-top:1px">Señales BORME</div>
      </td>
      <td style="padding-right:24px;border-left:1px solid ${C.border};padding-left:24px">
        <div style="font-size:20px;font-weight:700;color:${detailRows.length > 0 ? C.orange : C.text}">${detailRows.length}</div>
        <div style="font-size:9px;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;margin-top:1px">Fus./Adq./Posible</div>
      </td>
      <td style="border-left:1px solid ${C.border};padding-left:24px">
        <div style="font-size:20px;font-weight:700;color:${alertaPersonas.length > 0 ? C.sky : C.text}">${alertaPersonas.length}</div>
        <div style="font-size:9px;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;margin-top:1px">Alertas personas</div>
      </td>
    </tr></table>
  </td></tr>
`;

  // ── Section 1: Señales M&A ─────────────────────────────────────────────────
  html += `
  <!-- Section header: Señales M&A -->
  <tr><td style="padding:20px 28px 10px">
    <div style="font-size:10px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">🔔&nbsp;&nbsp;Señales M&amp;A</div>`;

  // Summary pills
  const TIPO_ORDER = ["fusion", "adquisicion", "posible_adquisicion", "cambio_denominacion", "nombramiento", "disolucion", "otros"];
  html += `<div style="margin-bottom:14px">`;
  for (const tipo of TIPO_ORDER) {
    if (!counts[tipo]) continue;
    const color = TIPO_COLOR[tipo] ?? C.hint;
    html += `&nbsp;${pill(`${counts[tipo]} ${TIPO_LABEL[tipo]}`, color)}&nbsp;`;
  }
  html += `</div>`;
  html += `</td></tr>`;

  // Detail table: only fusión, adquisición, posible adq.
  if (detailRows.length > 0) {
    html += `
  <tr><td style="padding:0 28px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid ${C.border};border-radius:6px;overflow:hidden">
      <tr>
        ${tdH("Tipo")}${tdH("Empresa")}${tdH("Adquirente")}${tdH("Ingresos", "right")}${tdH("EBITDA", "right")}${tdH("MB%", "right")}
      </tr>`;

    for (let i = 0; i < detailRows.length; i++) {
      const r = detailRows[i];
      const color = TIPO_COLOR[r.displayTipo] ?? C.hint;
      const fin = r.empresa.financieros[0];
      const ingresos = fin?.ingresos ?? null;
      const ebitda = fin?.ebitda ?? null;
      const mb = ingresos && fin?.margenBruto ? (fin.margenBruto / ingresos) * 100 : null;
      const isPosible = r.displayTipo === "posible_adquisicion";
      const bg = isPosible ? "#1f1408" : i % 2 === 0 ? C.surface : C.surface2;
      const bt = i > 0 ? `border-top:1px solid ${C.border};` : "";

      // Extract acquirer from descripcion
      const adquirente = r.grupoInferido?.nombre
        ?? (r.descripcion?.match(/(?:SOCIO[S]?|ADMINISTRADOR[A]?)[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]+?)(?:\.|$)/)?.[1]?.trim().slice(0, 40) ?? null);

      html += `
      <tr style="background:${bg};${bt}">
        <td style="padding:8px 10px">${pill(TIPO_LABEL[r.displayTipo], color, true)}</td>
        <td style="padding:8px 10px;font-size:11px;color:${C.text};font-weight:500;max-width:160px">
          ${r.empresa.nombre}
          ${r.empresa.enPerimetro ? `<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${C.blue};vertical-align:middle;margin-left:3px"></span>` : ""}
          ${r.grupoInferido ? `<div style="font-size:9px;color:${C.blue};margin-top:1px">${r.grupoInferido.nombre}</div>` : ""}
        </td>
        <td style="padding:8px 10px;font-size:10px;color:${C.muted};max-width:120px">${adquirente ?? `<span style="color:${C.hint}">—</span>`}</td>
        <td style="padding:8px 10px;font-size:11px;color:${C.muted};text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${fmtM(ingresos)}</td>
        <td style="padding:8px 10px;font-size:11px;color:${ebitda && ebitda < 0 ? C.red : C.muted};text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${fmtM(ebitda)}</td>
        <td style="padding:8px 10px;font-size:11px;color:${C.muted};text-align:right;white-space:nowrap">${fmtPct(mb)}</td>
      </tr>`;
    }
    html += `</table>
  </td></tr>`;
  } else {
    html += `
  <tr><td style="padding:0 28px 16px">
    <div style="font-size:12px;color:${C.hint};font-style:italic">Sin fusiones, adquisiciones ni posibles adquisiciones hoy.</div>
  </td></tr>`;
  }

  // Mapbox static map
  if (mapUrl) {
    html += `
  <tr><td style="padding:0 28px 20px">
    <div style="font-size:9px;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">Empresas en perímetro con alerta</div>
    <img src="${mapUrl}" width="560" height="240" alt="Mapa de señales BORME" style="display:block;border-radius:6px;border:1px solid ${C.border};width:100%;max-width:560px">
  </td></tr>`;
  }

  // Divider
  html += `<tr><td style="padding:0 28px"><div style="height:1px;background:${C.border}"></div></td></tr>`;

  // ── Section 2: Alertas personas ────────────────────────────────────────────
  html += `
  <tr><td style="padding:20px 28px 10px">
    <div style="font-size:10px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">👤&nbsp;&nbsp;Alertas personas</div>
    <div style="font-size:10px;color:${C.hint};margin-bottom:12px">Personas con cargo nuevo hoy en ≥2 empresas, de las cuales ≥1 está en perímetro.</div>
  </td></tr>`;

  if (alertaPersonas.length > 0) {
    for (let pi = 0; pi < alertaPersonas.length; pi++) {
      const { nombre, empresas } = alertaPersonas[pi];
      const mt = pi > 0 ? "margin-top:12px;" : "";
      html += `
  <tr><td style="padding:0 28px ${pi < alertaPersonas.length - 1 ? "4px" : "20px"}">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.border};border-radius:6px;overflow:hidden;${mt}">
      <tr style="background:${C.surface3}">
        <td colspan="3" style="padding:7px 10px;font-size:11px;font-weight:700;color:${C.text};letter-spacing:.3px">
          ${nombre}
          <span style="font-size:9px;color:${C.hint};font-weight:400;margin-left:6px">${empresas.length} empresas</span>
        </td>
      </tr>`;

      for (let ei = 0; ei < empresas.length; ei++) {
        const e = empresas[ei];
        const bg = ei % 2 === 0 ? C.surface : C.surface2;
        const bt = `border-top:1px solid ${C.border};`;
        html += `
      <tr style="background:${bg};${bt}">
        <td style="padding:7px 10px;font-size:11px;color:${C.text}">
          ${e.empresaNombre}
          ${e.enPerimetro ? `<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${C.blue};vertical-align:middle;margin-left:3px"></span>` : ""}
        </td>
        <td style="padding:7px 10px;font-size:10px;color:${C.hint}">${fmtDate(e.fecha)}</td>
        <td style="padding:7px 10px;font-size:10px;color:${C.muted};text-align:right;font-variant-numeric:tabular-nums">${fmtM(e.ingresos)}</td>
      </tr>`;
      }
      html += `</table>
  </td></tr>`;
    }
  } else {
    html += `
  <tr><td style="padding:0 28px 20px">
    <div style="font-size:12px;color:${C.hint};font-style:italic">Sin alertas de personas relevantes hoy.</div>
  </td></tr>`;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  html += `
  <!-- Footer -->
  <tr><td style="padding:14px 28px;border-top:1px solid ${C.border};background:${C.surface2}">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td style="font-size:10px;color:${C.hint}">
        <a href="${BASE_URL}" style="color:${C.blue};text-decoration:none;font-weight:600">warroom.fontiber.com</a>
        <span style="margin:0 5px;opacity:.4">·</span>Fontiber Industrial Partners
      </td>
      <td align="right" style="font-size:10px;color:${C.hint}">${fmtDate(today)}</td>
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
