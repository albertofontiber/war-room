"use client";

import { useEffect, useState } from "react";
import { fmtM as _fmtM, fmtPct as _fmtPct, fmtDate as _fmtDate } from "@/lib/format";
import { BORME_TIPO } from "@/lib/borme-constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BormeAlertaResumen {
  id: number;
  fecha: string;
  tipoActo: string;
  grupoInferido: { nombre: string } | null;
}

interface EmpresaEnGrupo {
  id: number;
  nombre: string;
  localidad: string | null;
  provincia: string | null;
  sector: string | null;
  empleados: number | null;
  web: string | null;
  financiero: {
    anio: number;
    ingresos: number | null;
    ebitda: number | null;
    ebitdaPct: number | null;
    margenBruto: number | null;
  } | null;
  crmStage: string | null;
  bormeAlertas: BormeAlertaResumen[];
}

interface GrupoDetalle {
  id: number;
  nombre: string;
  tipo: string;
  notas: string | null;
  empresasCount: number;
  totalIngresos: number | null;
  totalEbitda: number | null;
  ebitdaPct: number | null;
  totalEmpleados: number | null;
  empresas: EmpresaEnGrupo[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_GRUPO: Record<string, { label: string; pill: string }> = {
  PE:             { label: "Private Equity", pill: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  nacional:       { label: "Nacional",       pill: "bg-wr-blue/20 text-wr-blue border-wr-blue/30" },
  familiar:       { label: "Familiar",       pill: "bg-green-500/20 text-green-300 border-green-500/30" },
  multinacional:  { label: "Multinacional",  pill: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
};

// BORME_TIPO imported from @/lib/borme-constants

const CRM_PILL: Record<string, string> = {
  identificado:    "bg-[#64748b]/20 text-[#94a3b8]",
  contactado:      "bg-wr-blue/20 text-wr-blue",
  primera_reunion: "bg-wr-blue/20 text-wr-blue",
  analisis:        "bg-wr-blue/20 text-wr-blue",
  "LOI enviada":   "bg-wr-amber/20 text-wr-amber",
  execution:       "bg-wr-amber/20 text-wr-amber",
  portfolio:       "bg-wr-green/20 text-wr-green",
  muerto:          "bg-wr-red/20 text-wr-red",
};

const CRM_LABEL: Record<string, string> = {
  identificado: "Identificado", contactado: "Contactado",
  primera_reunion: "1ª reunión", analisis: "Análisis",
  "LOI enviada": "LOI", execution: "Ejecución",
  portfolio: "Portfolio", muerto: "Muerto",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtM = (n: number | null) => _fmtM(n, "—");
const fmtPct = (n: number | null) => _fmtPct(n, "—");
const fmtDate = (s: string) => _fmtDate(s, "—");

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-wr-hint uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-wr-text">{value}</span>
    </div>
  );
}

function GrupoCard({ grupo, onEmpresaClick }: {
  grupo: GrupoDetalle;
  onEmpresaClick: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const tipoCfg = TIPO_GRUPO[grupo.tipo] ?? { label: grupo.tipo, pill: "bg-wr-surface2 text-wr-muted border-wr-border" };

  return (
    <div className="bg-wr-surface border border-wr-border rounded-lg overflow-hidden">
      {/* Header — en mobile el badge tipo y el contador empresas hacen wrap
          bajo el nombre; en sm+ todo en una fila. Stats agregados solo en sm+. */}
      <div
        className="flex items-start sm:items-center justify-between gap-2 px-3 sm:px-4 py-3 cursor-pointer hover:bg-wr-surface2 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 ${tipoCfg.pill}`}>
              {tipoCfg.label}
            </span>
            <span className="text-wr-hint text-xs flex-shrink-0">{grupo.empresasCount} empresas</span>
          </div>
          <h3 className="text-sm font-bold text-wr-text truncate">{grupo.nombre}</h3>
        </div>

        {/* Aggregated stats */}
        <div className="flex items-center gap-3 sm:gap-6 flex-shrink-0 ml-2 sm:ml-4">
          <div className="hidden sm:flex gap-6">
            <StatChip label="Ingresos" value={fmtM(grupo.totalIngresos)} />
            <StatChip label="EBITDA" value={fmtM(grupo.totalEbitda)} />
            <StatChip label="EBITDA%" value={fmtPct(grupo.ebitdaPct)} />
            {grupo.totalEmpleados && (
              <StatChip label="Empleados" value={grupo.totalEmpleados.toLocaleString("es-ES")} />
            )}
          </div>
          <span className="text-wr-muted text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Stats agregados — versión móvil. En sm+ van inline en el header
          (hidden sm:flex), pero en móvil ese bloque se ocultaba y el grupo
          quedaba sin sus métricas resumidas. Aquí los mostramos siempre
          (también colapsado) como resumen rápido del grupo. */}
      <div className="sm:hidden flex flex-wrap items-center gap-x-5 gap-y-2 px-3 pb-3 pt-2.5 border-t border-wr-border">
        <StatChip label="Ingresos" value={fmtM(grupo.totalIngresos)} />
        <StatChip label="EBITDA" value={fmtM(grupo.totalEbitda)} />
        <StatChip label="EBITDA%" value={fmtPct(grupo.ebitdaPct)} />
        {grupo.totalEmpleados != null && (
          <StatChip label="Empleados" value={grupo.totalEmpleados.toLocaleString("es-ES")} />
        )}
      </div>

      {/* Empresa table */}
      {expanded && (
        <div className="border-t border-wr-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-wr-surface2 text-wr-hint uppercase tracking-wide text-[10px]">
                <th className="px-4 py-2 text-left font-medium">Empresa</th>
                <th className="px-3 py-2 text-left font-medium">Provincia</th>
                <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                <th className="px-3 py-2 text-right font-medium">EBITDA%</th>
                <th className="px-3 py-2 text-left font-medium">CRM</th>
                <th className="px-3 py-2 text-left font-medium">BORME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wr-border">
              {grupo.empresas.map((e) => (
                <tr
                  key={e.id}
                  className="hover:bg-wr-surface2 cursor-pointer transition-colors"
                  onClick={() => onEmpresaClick(e.id)}
                >
                  {/* Nombre */}
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-wr-text hover:text-wr-blue transition-colors">
                      {e.nombre}
                    </span>
                  </td>

                  {/* Provincia */}
                  <td className="px-3 py-2.5 text-wr-muted">{e.provincia ?? "—"}</td>

                  {/* Ingresos */}
                  <td className="px-3 py-2.5 text-right text-wr-text font-mono">
                    {fmtM(e.financiero?.ingresos ?? null)}
                    {e.financiero?.anio && (
                      <span className="text-wr-hint text-[10px] ml-1">{String(e.financiero.anio).slice(2)}</span>
                    )}
                  </td>

                  {/* EBITDA% */}
                  <td className={`px-3 py-2.5 text-right font-mono ${
                    e.financiero?.ebitdaPct == null ? "text-wr-hint" :
                    e.financiero.ebitdaPct >= 15 ? "text-wr-green" :
                    e.financiero.ebitdaPct >= 5 ? "text-wr-amber" : "text-wr-red"
                  }`}>
                    {fmtPct(e.financiero?.ebitdaPct ?? null)}
                  </td>

                  {/* CRM Stage */}
                  <td className="px-3 py-2.5">
                    {e.crmStage ? (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${CRM_PILL[e.crmStage] ?? "bg-wr-surface2 text-wr-muted"}`}>
                        {CRM_LABEL[e.crmStage] ?? e.crmStage}
                      </span>
                    ) : <span className="text-wr-hint">—</span>}
                  </td>

                  {/* BORME alerts */}
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {e.bormeAlertas.length === 0 && <span className="text-wr-hint">—</span>}
                      {e.bormeAlertas.map((a) => {
                        const cfg = BORME_TIPO[a.tipoActo] ?? { label: a.tipoActo, pill: "bg-wr-surface2 text-wr-muted border-wr-border" };
                        return (
                          <span
                            key={a.id}
                            title={fmtDate(a.fecha)}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${cfg.pill}`}
                          >
                            {cfg.label}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GruposView() {
  const [grupos, setGrupos] = useState<GrupoDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/grupos/detalle")
      .then((r) => r.json())
      .then((data) => { setGrupos(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Seleccionar empresa abriendo el panel lateral
  function onEmpresaClick(id: number) {
    // Dispatch custom event que WarRoomLayout puede escuchar
    window.dispatchEvent(new CustomEvent("selectEmpresa", { detail: { id } }));
  }

  const filtered = grupos.filter((g) =>
    !search || g.nombre.toLowerCase().includes(search.toLowerCase())
  );

  // Global stats
  const totalEmpresas = grupos.reduce((s, g) => s + g.empresasCount, 0);
  const totalIngresos = grupos.reduce((s, g) => s + (g.totalIngresos ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-wr-muted text-sm">
        Cargando grupos…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-wr-bg">
      {/* Header bar — stack vertical en mobile, horizontal en sm+. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-6 py-3 sm:py-4 border-b border-wr-border flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
          <h2 className="text-base font-bold text-wr-text">Grupos</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-wr-muted">
            <span><span className="text-wr-text font-semibold">{grupos.length}</span> grupos</span>
            <span><span className="text-wr-text font-semibold">{totalEmpresas}</span> empresas</span>
            <span><span className="text-wr-text font-semibold">{fmtM(totalIngresos)}</span> ingresos totales</span>
          </div>
        </div>
        <input
          type="text"
          placeholder="Buscar grupo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-wr-surface border border-wr-border rounded px-3 py-1.5 text-xs text-wr-text placeholder-wr-hint focus:outline-none focus:border-wr-blue w-full sm:w-48"
        />
      </div>

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 space-y-3">
        {filtered.length === 0 && (
          <p className="text-wr-muted text-sm text-center mt-8">No hay grupos que coincidan.</p>
        )}
        {filtered.map((g) => (
          <GrupoCard key={g.id} grupo={g} onEmpresaClick={onEmpresaClick} />
        ))}
      </div>
    </div>
  );
}
