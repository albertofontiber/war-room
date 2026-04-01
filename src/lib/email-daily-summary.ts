/**
 * Daily summary email — fetches today's data and sends via Resend.
 * Called from /api/cron/daily-summary.
 *
 * Sections:
 *  1. Señales M&A — summary pills + detail table (fusión/adquisición/posible adq.)
 *                   + static Mapbox map of in-perimeter companies with alerts
 *  2. Alertas personas — people who today appear in ≥2 companies, ≥1 in perimeter
 *
 * Outlook compatibility: bgcolor attributes on all table/td elements alongside
 * background-color CSS, so Outlook's Word renderer respects dark colors.
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

function pill(text: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.3px;background:${color}22;color:${color};border:1px solid ${color}44;white-space:nowrap">${text}</span>`;
}

// bgcolor-aware td: always includes both bgcolor attr and background-color CSS
function td(bg: string, style: string, content: string, extraAttrs = ""): string {
  return `<td bgcolor="${bg}" style="background-color:${bg};${style}" ${extraAttrs}>${content}</td>`;
}

// ─── Mapbox static map ────────────────────────────────────────────────────────
function buildMapUrl(coords: Array<[number, number]>): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || coords.length === 0) return null;
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

  // ── 1. BORME alerts ────────────────────────────────────────────────────────
  const bormeAlertas = await prisma.bormeAlerta.findMany({
    where: { createdAt: { gte: todayStart } },
    include: {
      empresa: {
        select: {
          nombre: true, web: true, enPerimetro: true, ccaa: true,
          lat: true, lng: true,
          financieros: { orderBy: { anio: "desc" }, take: 1, select: { ingresos: true, ebitda: true, margenBruto: true } },
        },
      },
      grupoInferido: { select: { nombre: true } },
    },
    orderBy: { fecha: "desc" },
  });

  // ── 2. Personas: today, ≥2 companies, ≥1 in perimeter ─────────────────────
  const todayPersonaAlertas = bormeAlertas.filter(
    (a) => a.tipoActo === "nombramiento" || a.tipoActo === "nombramiento_grupo"
  );
  const personasHoy = Array.from(new Set(
    todayPersonaAlertas.map((a) => a.personaDetectada).filter(Boolean) as string[]
  ));

  const alertaPersonas: Array<{
    nombre: string;
    empresas: Array<{ empresaNombre: string; enPerimetro: boolean; fecha: Date; ingresos: number | null }>;
  }> = [];

  if (personasHoy.length > 0) {
    const historial = await prisma.bormeAlerta.findMany({
      where: { tipoActo: { in: ["nombramiento", "nombramiento_grupo"] }, personaDetectada: { in: personasHoy } },
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

    const byPersona = new Map<string, typeof historial>();
    for (const a of historial) {
      if (!byPersona.has(a.personaDetectada!)) byPersona.set(a.personaDetectada!, []);
      byPersona.get(a.personaDetectada!)!.push(a);
    }

    for (const [nombre, apariciones] of Array.from(byPersona.entries())) {
      const byEmpresa = new Map<number, typeof apariciones[number]>();
      for (const a of apariciones) {
        if (!byEmpresa.has(a.empresaId)) byEmpresa.set(a.empresaId, a);
      }
      const empresas = Array.from(byEmpresa.values());
      if (empresas.length >= 2 && empresas.some((a) => a.empresa.enPerimetro)) {
        alertaPersonas.push({
          nombre,
          empresas: empresas.map((a) => ({
            empresaNombre: a.empresa.nombre,
            enPerimetro: a.empresa.enPerimetro,
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

  // ── Compute efectiveTipo + counts ──────────────────────────────────────────
  const rows = bormeAlertas.map((a) => {
    let tipo = a.tipoActo;
    if (a.tipoActo === "nombramiento_grupo" && a.grupoInferido) tipo = "posible_adquisicion";
    return { ...a, displayTipo: tipo };
  });

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.displayTipo] = (counts[r.displayTipo] ?? 0) + 1;

  const detailRows = rows.filter((r) => DETAIL_TIPOS.has(r.displayTipo));

  const mapCoords: Array<[number, number]> = bormeAlertas
    .filter((a) => a.empresa.enPerimetro && a.empresa.lng != null && a.empresa.lat != null)
    .map((a) => [a.empresa.lng!, a.empresa.lat!] as [number, number]);
  const mapUrl = buildMapUrl(mapCoords);

  const today = new Date();
  const dateLabel = today.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  // ── Build HTML ─────────────────────────────────────────────────────────────
  let html = `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <title>War Room — Resumen diario</title>
  <style type="text/css">
    body { margin:0 !important; padding:0 !important; background-color:${C.bg} !important; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; display:block; }
    /* Prevent Outlook dark mode from inverting our already-dark colors */
    [data-ogsc] body, [data-ogsb] body { background-color:${C.bg} !important; }
    [data-ogsc] .wr-surface, [data-ogsb] .wr-surface { background-color:${C.surface} !important; }
    [data-ogsc] .wr-surface2, [data-ogsb] .wr-surface2 { background-color:${C.surface2} !important; }
    [data-ogsc] .wr-surface3, [data-ogsb] .wr-surface3 { background-color:${C.surface3} !important; }
    [data-ogsc] .wr-text, [data-ogsb] .wr-text { color:${C.text} !important; }
    [data-ogsc] .wr-muted, [data-ogsb] .wr-muted { color:${C.muted} !important; }
    [data-ogsc] .wr-hint, [data-ogsb] .wr-hint { color:${C.hint} !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased" bgcolor="${C.bg}">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="${C.bg}" style="background-color:${C.bg}">
<tr>
<td align="center" style="padding:28px 16px" bgcolor="${C.bg}">

<!-- Inner container 600px -->
<table width="600" cellpadding="0" cellspacing="0" role="presentation" bgcolor="${C.surface}" style="background-color:${C.surface};border:1px solid ${C.border};border-radius:8px">

  <!-- Header -->
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:20px 28px 16px;border-bottom:2px solid ${C.border}">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td>
            <div style="font-size:12px;font-weight:800;color:${C.text};letter-spacing:2px;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">FONTIBER WAR ROOM</div>
            <div style="font-size:10px;color:${C.hint};margin-top:3px;letter-spacing:.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Resumen diario &middot; M&amp;A Intelligence</div>
          </td>
          <td align="right" style="font-size:11px;color:${C.hint};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${dateCapitalized}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Stats bar -->
  <tr>
    <td bgcolor="${C.surface2}" class="wr-surface2" style="background-color:${C.surface2};padding:16px 28px;border-bottom:1px solid ${C.border}">
      <table cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="padding-right:28px;text-align:center" valign="top">
            <div style="font-size:26px;font-weight:700;color:${C.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1">${bormeAlertas.length}</div>
            <div style="font-size:9px;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;margin-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Señales BORME</div>
          </td>
          <td style="padding:0 28px;border-left:1px solid ${C.border};text-align:center" valign="top">
            <div style="font-size:26px;font-weight:700;color:${detailRows.length > 0 ? C.orange : C.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1">${detailRows.length}</div>
            <div style="font-size:9px;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;margin-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Fus./Adq./Posible</div>
          </td>
          <td style="padding-left:28px;border-left:1px solid ${C.border};text-align:center" valign="top">
            <div style="font-size:26px;font-weight:700;color:${alertaPersonas.length > 0 ? C.sky : C.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1">${alertaPersonas.length}</div>
            <div style="font-size:9px;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;margin-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Alertas personas</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

`;

  // ── Section 1: Señales M&A ─────────────────────────────────────────────────
  // Section title
  html += `
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:20px 28px 4px">
      <div style="font-size:10px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:1.2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">&#128276;&nbsp; Se&ntilde;ales M&amp;A</div>
    </td>
  </tr>
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:10px 28px 16px">`;

  // Summary pills
  const TIPO_ORDER = ["fusion", "adquisicion", "posible_adquisicion", "cambio_denominacion", "nombramiento", "disolucion", "otros"];
  for (const tipo of TIPO_ORDER) {
    if (!counts[tipo]) continue;
    const color = TIPO_COLOR[tipo] ?? C.hint;
    html += `${pill(`${counts[tipo]} ${TIPO_LABEL[tipo]}`, color)}&nbsp; `;
  }
  html += `</td></tr>`;

  // Detail table
  if (detailRows.length > 0) {
    html += `
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:0 28px 16px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid ${C.border}">
        <tr bgcolor="${C.surface3}">
          ${td(C.surface3, "padding:8px 10px;font-size:9px;font-weight:700;color:"+C.hint+";text-transform:uppercase;letter-spacing:.8px", "Tipo")}
          ${td(C.surface3, "padding:8px 10px;font-size:9px;font-weight:700;color:"+C.hint+";text-transform:uppercase;letter-spacing:.8px", "Empresa")}
          ${td(C.surface3, "padding:8px 10px;font-size:9px;font-weight:700;color:"+C.hint+";text-transform:uppercase;letter-spacing:.8px", "Adquirente")}
          ${td(C.surface3, "padding:8px 10px;font-size:9px;font-weight:700;color:"+C.hint+";text-transform:uppercase;letter-spacing:.8px;text-align:right", "Ingresos")}
          ${td(C.surface3, "padding:8px 10px;font-size:9px;font-weight:700;color:"+C.hint+";text-transform:uppercase;letter-spacing:.8px;text-align:right", "EBITDA")}
          ${td(C.surface3, "padding:8px 10px;font-size:9px;font-weight:700;color:"+C.hint+";text-transform:uppercase;letter-spacing:.8px;text-align:right", "MB%")}
        </tr>`;

    for (let i = 0; i < detailRows.length; i++) {
      const r = detailRows[i];
      const color = TIPO_COLOR[r.displayTipo] ?? C.hint;
      const fin = r.empresa.financieros[0];
      const ingresos = fin?.ingresos ?? null;
      const ebitda = fin?.ebitda ?? null;
      const mb = ingresos && fin?.margenBruto ? (fin.margenBruto / ingresos) * 100 : null;
      const isPosible = r.displayTipo === "posible_adquisicion";
      const rowBg = isPosible ? "#1f1408" : i % 2 === 0 ? C.surface : C.surface2;
      const bt = `border-top:1px solid ${C.border};`;

      const adquirente = r.grupoInferido?.nombre
        ?? (r.descripcion?.match(/(?:SOCIOS?|ADMINISTRADORA?)[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]+?)(?:\.|$)/)?.[1]?.trim().slice(0, 35) ?? null);

      const empresaHtml = `<span style="font-size:11px;color:${C.text};font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${r.empresa.nombre}${r.empresa.enPerimetro ? `&nbsp;<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${C.blue};vertical-align:middle"></span>` : ""}</span>${r.grupoInferido ? `<br><span style="font-size:9px;color:${C.blue};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${r.grupoInferido.nombre}</span>` : ""}`;

      html += `
        <tr bgcolor="${rowBg}">
          ${td(rowBg, bt+"padding:8px 10px", pill(TIPO_LABEL[r.displayTipo], color))}
          ${td(rowBg, bt+"padding:8px 10px;max-width:150px", empresaHtml)}
          ${td(rowBg, bt+"padding:8px 10px;font-size:10px;color:"+C.muted+";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", adquirente ?? `<span style="color:${C.hint}">—</span>`)}
          ${td(rowBg, bt+"padding:8px 10px;font-size:11px;color:"+C.muted+";text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", fmtM(ingresos))}
          ${td(rowBg, bt+"padding:8px 10px;font-size:11px;color:"+(ebitda && ebitda < 0 ? C.red : C.muted)+";text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", fmtM(ebitda))}
          ${td(rowBg, bt+"padding:8px 10px;font-size:11px;color:"+C.muted+";text-align:right;white-space:nowrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", fmtPct(mb))}
        </tr>`;
    }

    html += `
      </table>
      <div style="padding:8px 0 0">
        <a href="${BASE_URL}" style="font-size:11px;color:${C.blue};text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Ver todas en War Room &rarr;</a>
      </div>
    </td>
  </tr>`;
  } else {
    html += `
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:0 28px 16px">
      <div style="font-size:12px;color:${C.hint};font-style:italic;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Sin fusiones, adquisiciones ni posibles adquisiciones hoy.</div>
    </td>
  </tr>`;
  }

  // Map
  if (mapUrl) {
    html += `
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:0 28px 20px">
      <div style="font-size:9px;color:${C.hint};text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Empresas en per&iacute;metro con alerta</div>
      <img src="${mapUrl}" width="544" height="232" alt="Mapa señales BORME" style="display:block;border:1px solid ${C.border};border-radius:4px;width:100%;max-width:544px">
    </td>
  </tr>`;
  }

  // Divider
  html += `
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:0 28px">
      <div style="height:1px;font-size:0;line-height:0;background-color:${C.border}">&nbsp;</div>
    </td>
  </tr>`;

  // ── Section 2: Alertas personas ────────────────────────────────────────────
  html += `
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:20px 28px 6px">
      <div style="font-size:10px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:1.2px;margin-bottom:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">&#128100;&nbsp; Alertas personas</div>
      <div style="font-size:10px;color:${C.hint};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Personas con nuevo cargo hoy en &ge;2 empresas, con &ge;1 en per&iacute;metro.</div>
    </td>
  </tr>`;

  if (alertaPersonas.length > 0) {
    for (let pi = 0; pi < alertaPersonas.length; pi++) {
      const { nombre, empresas } = alertaPersonas[pi];
      const isLast = pi === alertaPersonas.length - 1;
      html += `
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:8px 28px ${isLast ? "20px" : "4px"}">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.border}">
        <tr>
          ${td(C.surface3, "padding:8px 12px;font-size:11px;font-weight:700;color:"+C.text+";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", `${nombre}&nbsp;<span style="font-size:9px;color:${C.hint};font-weight:400">${empresas.length} empresas</span>`)}
        </tr>`;

      for (let ei = 0; ei < empresas.length; ei++) {
        const e = empresas[ei];
        const rowBg = ei % 2 === 0 ? C.surface : C.surface2;
        html += `
        <tr>
          ${td(rowBg, "border-top:1px solid "+C.border+";padding:7px 12px;font-size:11px;color:"+C.text+";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", `${e.empresaNombre}${e.enPerimetro ? `&nbsp;<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${C.blue};vertical-align:middle"></span>` : ""}`)}
          ${td(rowBg, "border-top:1px solid "+C.border+";padding:7px 12px;font-size:10px;color:"+C.hint+";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:nowrap", fmtDate(e.fecha))}
          ${td(rowBg, "border-top:1px solid "+C.border+";padding:7px 12px;font-size:10px;color:"+C.muted+";text-align:right;white-space:nowrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", fmtM(e.ingresos))}
        </tr>`;
      }
      html += `
      </table>
    </td>
  </tr>`;
    }
  } else {
    html += `
  <tr>
    <td bgcolor="${C.surface}" class="wr-surface" style="background-color:${C.surface};padding:8px 28px 20px">
      <div style="font-size:12px;color:${C.hint};font-style:italic;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Sin alertas de personas relevantes hoy.</div>
    </td>
  </tr>`;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  html += `
  <tr>
    <td bgcolor="${C.surface2}" class="wr-surface2" style="background-color:${C.surface2};padding:14px 28px;border-top:1px solid ${C.border}">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="font-size:10px;color:${C.hint};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
            <a href="${BASE_URL}" style="color:${C.blue};text-decoration:none;font-weight:600">warroom.fontiber.com</a>
            <span style="margin:0 5px;color:${C.hint};opacity:.5">&middot;</span>Fontiber Industrial Partners
          </td>
          <td align="right" style="font-size:10px;color:${C.hint};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${fmtDate(today)}</td>
        </tr>
      </table>
    </td>
  </tr>

</table><!-- /inner 600px -->
</td>
</tr>
</table><!-- /outer wrapper -->

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
