/**
 * /daily/[fecha] — Server-rendered daily summary page.
 * fecha format: YYYY-MM-DD (e.g. 2026-04-01)
 *
 * Auth-protected: redirects to /login if not signed in.
 * Linked from the daily summary email.
 */

import { prisma } from "@/lib/prisma";
import { fmtM as _fmtM } from "@/lib/format";
import { BORME_TIPO, BORME_TIPO_ORDER, BORME_DETAIL_TIPOS } from "@/lib/borme-constants";

const TIPO_LABEL = Object.fromEntries(
  Object.entries(BORME_TIPO).map(([k, v]) => [k, v.label])
);
const TIPO_COLOR = Object.fromEntries(
  Object.entries(BORME_TIPO).map(([k, v]) => [k, v.pill])
);
const DETAIL_TIPOS = BORME_DETAIL_TIPOS;
const TIPO_ORDER = BORME_TIPO_ORDER;

const fmtM = (v: number | null | undefined) => _fmtM(v, "—");

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function DailyPage({
  params,
}: {
  params: { fecha: string };
}) {
  // Parse fecha param
  const match = params.fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return (
      <div className="min-h-screen bg-wr-bg flex items-center justify-center">
        <p className="text-wr-muted">Formato de fecha inválido. Usa YYYY-MM-DD.</p>
      </div>
    );
  }

  const dayStart = new Date(`${params.fecha}T00:00:00`);
  const dayEnd   = new Date(); // hasta ahora (cubre desde la fecha hasta hoy)

  // ── Fetch BORME alerts ──────────────────────────────────────────────────────
  const bormeAlertas = await prisma.bormeAlerta.findMany({
    where: {
      createdAt: { gte: dayStart, lte: dayEnd },
      empresa:   { enPerimetro: true },
    },
    include: {
      empresa: {
        select: {
          id: true, nombre: true, web: true, enPerimetro: true, ccaa: true,
          lat: true, lng: true,
          financieros: {
            orderBy: { anio: "desc" },
            take: 1,
            select: { ingresos: true, ebitda: true, margenBruto: true },
          },
        },
      },
      grupoInferido: { select: { nombre: true } },
    },
    orderBy: { fecha: "desc" },
  });

  // ── Compute display tipo + counts ───────────────────────────────────────────
  const rows = bormeAlertas.map((a) => ({
    ...a,
    displayTipo:
      a.tipoActo === "nombramiento_grupo" && a.grupoInferido
        ? "posible_adquisicion"
        : a.tipoActo,
  }));

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.displayTipo] = (counts[r.displayTipo] ?? 0) + 1;

  const detailRows = rows.filter((r) => DETAIL_TIPOS.has(r.displayTipo));

  // ── Personas: today's nombramientos → ≥2 empresas, ≥1 in perimeter ─────────
  const todayPersonaAlertas = bormeAlertas.filter(
    (a) => a.tipoActo === "nombramiento" || a.tipoActo === "nombramiento_grupo"
  );
  const personasHoy = Array.from(
    new Set(
      todayPersonaAlertas.map((a) => a.personaDetectada).filter(Boolean) as string[]
    )
  );

  const alertaPersonas: Array<{
    nombre: string;
    empresas: Array<{
      empresaNombre: string;
      enPerimetro: boolean;
      fecha: Date;
      ingresos: number | null;
    }>;
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

    const byPersona = new Map<string, typeof historial>();
    for (const a of historial) {
      if (!byPersona.has(a.personaDetectada!))
        byPersona.set(a.personaDetectada!, []);
      byPersona.get(a.personaDetectada!)!.push(a);
    }

    for (const [nombre, apariciones] of Array.from(byPersona.entries())) {
      const byEmpresa = new Map<number, (typeof apariciones)[number]>();
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

  // ── Date label ──────────────────────────────────────────────────────────────
  const isToday = dayStart.toDateString() === new Date().toDateString();
  const dateLabel = isToday
    ? dayStart.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : `${dayStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
  const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-wr-bg text-wr-text font-sans">
      {/* Top bar */}
      <div className="border-b border-wr-border bg-wr-surface">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold tracking-widest uppercase text-wr-muted">
              FONTIBER WAR ROOM
            </span>
            <p className="text-xs text-wr-hint mt-0.5">Resumen diario · M&A Intelligence</p>
          </div>
          <a
            href="/"
            className="text-xs text-wr-blue hover:underline"
          >
            ← Ir al War Room
          </a>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Date header */}
        <div>
          <h1 className="text-2xl font-bold text-wr-text">{dateCapitalized}</h1>
          <p className="text-sm text-wr-hint mt-1">Resumen de señales BORME y alertas de personas</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-wr-surface border border-wr-border rounded-lg px-5 py-4 text-center">
            <div className="text-3xl font-bold text-wr-text">{bormeAlertas.length}</div>
            <div className="text-[10px] uppercase tracking-widest text-wr-hint mt-1">Señales BORME</div>
          </div>
          <div className="bg-wr-surface border border-wr-border rounded-lg px-5 py-4 text-center">
            <div className={`text-3xl font-bold ${detailRows.length > 0 ? "text-orange-400" : "text-wr-text"}`}>
              {detailRows.length}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-wr-hint mt-1">Fus./Adq./Posible</div>
          </div>
          <div className="bg-wr-surface border border-wr-border rounded-lg px-5 py-4 text-center">
            <div className={`text-3xl font-bold ${alertaPersonas.length > 0 ? "text-sky-400" : "text-wr-text"}`}>
              {alertaPersonas.length}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-wr-hint mt-1">Alertas personas</div>
          </div>
        </div>

        {/* ── Section 1: Señales M&A ── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-wr-muted mb-4">
            🔔 Señales M&amp;A
          </h2>

          {/* Pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {TIPO_ORDER.filter((t) => counts[t]).map((tipo) => (
              <span
                key={tipo}
                className={`inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold border ${TIPO_COLOR[tipo] ?? "text-wr-hint bg-wr-hint/10 border-wr-hint/30"}`}
              >
                {counts[tipo]} {TIPO_LABEL[tipo]}
              </span>
            ))}
            {Object.keys(counts).length === 0 && (
              <span className="text-sm text-wr-hint italic">Sin señales hoy.</span>
            )}
          </div>

          {/* Detail table */}
          {detailRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-wr-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-wr-surface2 border-b border-wr-border">
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">Tipo</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">Empresa</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">Adquirente</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">Ingresos</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">EBITDA</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">MB%</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">BORME</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((r, i) => {
                    const fin = r.empresa.financieros[0];
                    const ingresos = fin?.ingresos ?? null;
                    const ebitda = fin?.ebitda ?? null;
                    const mb =
                      ingresos && fin?.margenBruto
                        ? (fin.margenBruto / ingresos) * 100
                        : null;
                    const isPosible = r.displayTipo === "posible_adquisicion";
                    const adquirente =
                      r.grupoInferido?.nombre ??
                      (r.descripcion
                        ?.match(
                          /(?:SOCIOS?|ADMINISTRADORA?)[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]+?)(?:\.|$)/
                        )?.[1]
                        ?.trim()
                        .slice(0, 35) ?? null);
                    return (
                      <tr
                        key={r.id}
                        className={`border-t border-wr-border ${
                          isPosible
                            ? "bg-orange-950/30"
                            : i % 2 === 0
                            ? "bg-wr-surface"
                            : "bg-wr-surface2"
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${TIPO_COLOR[r.displayTipo] ?? ""}`}
                          >
                            {TIPO_LABEL[r.displayTipo]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-wr-text font-medium text-[12px]">
                            {r.empresa.nombre}
                          </span>
                          {r.empresa.enPerimetro && (
                            <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-wr-blue align-middle" />
                          )}
                          {r.grupoInferido && (
                            <div className="text-[10px] text-wr-blue mt-0.5">
                              {r.grupoInferido.nombre}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-wr-muted">
                          {adquirente ?? <span className="text-wr-hint">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-wr-muted text-right tabular-nums">
                          {fmtM(ingresos)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-[11px] text-right tabular-nums ${
                            ebitda != null && ebitda < 0 ? "text-red-400" : "text-wr-muted"
                          }`}
                        >
                          {fmtM(ebitda)}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-wr-muted text-right">
                          {mb != null ? `${mb.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {r.urlBorme ? (
                            <a href={r.urlBorme} target="_blank" rel="noopener noreferrer" className="text-wr-blue hover:underline text-[10px]">PDF</a>
                          ) : <span className="text-wr-hint text-[10px]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {detailRows.length === 0 && (
            <p className="text-sm text-wr-hint italic">
              Sin fusiones, adquisiciones ni posibles adquisiciones hoy.
            </p>
          )}
        </section>

        {/* ── Section 2: All BORME alerts ── */}
        {rows.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-wr-muted mb-4">
              📋 Todas las señales ({rows.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border border-wr-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-wr-surface2 border-b border-wr-border">
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">Tipo</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">Empresa</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">CCAA</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">Fecha BORME</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">Ingresos</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-wr-hint">BORME</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const fin = r.empresa.financieros[0];
                    return (
                      <tr
                        key={r.id}
                        className={`border-t border-wr-border ${
                          i % 2 === 0 ? "bg-wr-surface" : "bg-wr-surface2"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${TIPO_COLOR[r.displayTipo] ?? ""}`}
                          >
                            {TIPO_LABEL[r.displayTipo] ?? r.tipoActo}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-wr-text text-[12px]">
                            {r.empresa.nombre}
                          </span>
                          {r.empresa.enPerimetro && (
                            <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-wr-blue align-middle" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-wr-muted">
                          {r.empresa.ccaa ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-wr-hint">
                          {fmtDate(r.fecha)}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-wr-muted text-right tabular-nums">
                          {fmtM(fin?.ingresos ?? null)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.urlBorme ? (
                            <a href={r.urlBorme} target="_blank" rel="noopener noreferrer" className="text-wr-blue hover:underline text-[10px]">PDF</a>
                          ) : <span className="text-wr-hint text-[10px]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Section 3: Alertas personas ── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-wr-muted mb-1">
            👤 Alertas personas
          </h2>
          <p className="text-xs text-wr-hint mb-4">
            Personas con nuevo cargo hoy en ≥2 empresas, con ≥1 en perímetro.
          </p>

          {alertaPersonas.length > 0 ? (
            <div className="space-y-3">
              {alertaPersonas.map(({ nombre, empresas }) => (
                <div
                  key={nombre}
                  className="rounded-lg border border-wr-border overflow-hidden"
                >
                  <div className="bg-wr-surface2 px-4 py-2.5 flex items-center gap-2">
                    <span className="text-sm font-semibold text-wr-text">{nombre}</span>
                    <span className="text-[10px] text-wr-hint">{empresas.length} empresas</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {empresas.map((e, ei) => (
                        <tr
                          key={e.empresaNombre}
                          className={`border-t border-wr-border ${
                            ei % 2 === 0 ? "bg-wr-surface" : "bg-wr-surface2"
                          }`}
                        >
                          <td className="px-4 py-2 text-[12px] text-wr-text">
                            {e.empresaNombre}
                            {e.enPerimetro && (
                              <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-wr-blue align-middle" />
                            )}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-wr-hint whitespace-nowrap">
                            {fmtDate(e.fecha)}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-wr-muted text-right tabular-nums">
                            {fmtM(e.ingresos)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-wr-hint italic">
              Sin alertas de personas relevantes hoy.
            </p>
          )}
        </section>

        {/* Footer */}
        <div className="border-t border-wr-border pt-6 text-center">
          <p className="text-xs text-wr-hint">
            Fontiber Industrial Partners ·{" "}
            <a href="/" className="text-wr-blue hover:underline">
              warroom.fontiber.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
