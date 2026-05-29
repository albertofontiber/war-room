import { BORME_TIPO } from "@/lib/borme-constants";
import { FILTER_TIPOS } from "./types";
import type { SubVista } from "./types";

/** Barra superior con: toggle de sub-vista (2 tabs: Señales / Alertas personas),
 *  refresh, chips de filtros globales del store, pills de tipo (solo en señales)
 *  y rango de fechas. La pestaña "Actividad reciente" se eliminó tras fusionar
 *  sus tipos (`disolucion`, `otros`) dentro de Señales M&A. */
export function TopBar({
  subVista,
  setSubVista,
  personasCount,
  loading,
  tiposActivos,
  toggleTipo,
  fechaDesde,
  setFechaDesde,
  fechaHasta,
  setFechaHasta,
  filtrosAplicados,
  onRefresh,
}: {
  subVista: SubVista;
  setSubVista: (v: SubVista) => void;
  personasCount: number;
  loading: boolean;
  tiposActivos: Set<string>;
  toggleTipo: (t: string) => void;
  fechaDesde: string;
  setFechaDesde: (v: string) => void;
  fechaHasta: string;
  setFechaHasta: (v: string) => void;
  filtrosAplicados: string[];
  onRefresh: () => void;
}) {
  return (
    <div className="flex-shrink-0 px-3 sm:px-4 py-2.5 border-b border-wr-border bg-wr-surface flex items-center gap-2 sm:gap-3 flex-wrap">
      {/* Sub-tab toggle */}
      <div className="flex items-center gap-1 bg-wr-surface2 border border-wr-border rounded-md p-0.5">
        <button
          onClick={() => setSubVista("senales")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            subVista === "senales"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Señales M&A
        </button>
        <button
          onClick={() => setSubVista("alertas_personas")}
          className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
            subVista === "alertas_personas"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Alertas personas
          {personasCount > 0 && (
            <span
              className={`text-[9px] font-bold px-1 rounded ${
                subVista === "alertas_personas"
                  ? "bg-white/20"
                  : "bg-wr-amber/20 text-wr-amber"
              }`}
            >
              {personasCount}
            </span>
          )}
        </button>
      </div>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="text-wr-hint hover:text-wr-text transition-colors disabled:opacity-40"
        title="Actualizar datos"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={loading ? "animate-spin" : ""}
        >
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Sidebar filter chips */}
      {filtrosAplicados.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-wr-hint">Filtros:</span>
          {filtrosAplicados.map((f) => (
            <span
              key={f}
              className="text-[10px] bg-wr-blue/10 text-wr-blue border border-wr-blue/20 px-1.5 py-0.5 rounded"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Tipo pills — señales only.
          `flex-wrap` + `whitespace-nowrap`/`flex-shrink-0` en cada pill: en
          móvil los chips envuelven a varias líneas pero cada uno se mantiene en
          una sola línea. Antes el contenedor no envolvía y el flex encogía los
          chips, partiendo el único label con espacio ("Posible adq.") en dos
          líneas → quedaba más alto que el resto. */}
      {subVista === "senales" && (
        <div className="flex items-center gap-1 flex-wrap">
          {FILTER_TIPOS.map((t) => {
            const cfg = BORME_TIPO[t];
            const on = tiposActivos.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleTipo(t)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors whitespace-nowrap flex-shrink-0 ${
                  on
                    ? cfg.pill
                    : "bg-transparent border-wr-border text-wr-hint hover:border-wr-muted"
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Date range */}
      <div className="flex items-center gap-1.5 text-[10px] text-wr-hint">
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="bg-wr-surface2 border border-wr-border rounded px-2 py-0.5 text-[10px] text-wr-text focus:outline-none focus:border-wr-blue"
          title="Desde"
        />
        <span>—</span>
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="bg-wr-surface2 border border-wr-border rounded px-2 py-0.5 text-[10px] text-wr-text focus:outline-none focus:border-wr-blue"
          title="Hasta"
        />
        {(fechaDesde || fechaHasta) && (
          <button
            onClick={() => {
              setFechaDesde("");
              setFechaHasta("");
            }}
            className="text-wr-hint hover:text-wr-text"
            title="Quitar filtro fechas"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
