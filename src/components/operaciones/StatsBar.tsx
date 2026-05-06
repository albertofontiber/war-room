import { BORME_TIPO } from "@/lib/borme-constants";
import type { OperacionItem, PersonaCompartida, RecienteItem, SubVista } from "./types";

/** Barra de estadísticas debajo de la TopBar/banner. Cambia el contenido
 *  según `subVista` y muestra un aviso al final si hay filtros del sidebar
 *  activos (los del store, no los locales de fecha o tipo). */
export function StatsBar({
  subVista,
  // señales
  filteredItems,
  loading,
  error,
  stats,
  // personas
  filteredPersonas,
  loadingPersonas,
  errorPersonas,
  totalApariciones,
  // actividad
  filteredRecientes,
  loadingRecientes,
  errorRecientes,
  filtrosAplicados,
}: {
  subVista: SubVista;
  filteredItems: OperacionItem[];
  loading: boolean;
  error: string | null;
  stats: { porTipo: Record<string, number>; gruposActivos: number };
  filteredPersonas: PersonaCompartida[];
  loadingPersonas: boolean;
  errorPersonas: string | null;
  totalApariciones: number;
  filteredRecientes: RecienteItem[];
  loadingRecientes: boolean;
  errorRecientes: string | null;
  filtrosAplicados: string[];
}) {
  return (
    <div className="flex-shrink-0 flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-1.5 border-b border-wr-border bg-wr-surface/50 text-[10px] text-wr-muted flex-wrap">
      {subVista === "senales" && !loading && !error && (
        <>
          <span className="font-semibold text-wr-text">{filteredItems.length} señales</span>
          <span className="text-wr-border">·</span>
          {Object.entries(stats.porTipo).map(([tipo, n]) => (
            <span key={tipo}>
              <span className="font-medium text-wr-text">{n}</span> {BORME_TIPO[tipo]?.label ?? tipo}
            </span>
          ))}
          <span className="text-wr-border">·</span>
          <span>
            <span className="font-medium text-wr-blue">{stats.gruposActivos}</span> grupos activos
          </span>
        </>
      )}
      {subVista === "alertas_personas" && !loadingPersonas && !errorPersonas && (
        <>
          <span className="font-semibold text-wr-text">{filteredPersonas.length} personas</span>
          <span className="text-wr-border">·</span>
          <span>
            <span className="font-medium text-wr-text">{totalApariciones}</span> apariciones en empresas
          </span>
        </>
      )}
      {subVista === "actividad" && !loadingRecientes && !errorRecientes && (
        <>
          <span className="font-semibold text-wr-text">{filteredRecientes.length} actos</span>
          <span className="text-wr-border">·</span>
          {Object.entries(
            filteredRecientes.reduce(
              (acc, i) => {
                acc[i.tipoActo] = (acc[i.tipoActo] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            )
          ).map(([tipo, n]) => (
            <span key={tipo}>
              <span className="font-medium text-wr-text">{n}</span> {BORME_TIPO[tipo]?.label ?? tipo}
            </span>
          ))}
        </>
      )}
      {filtrosAplicados.length > 0 && (
        <span className="text-wr-amber ml-auto">⬡ Filtros del panel activos</span>
      )}
    </div>
  );
}
