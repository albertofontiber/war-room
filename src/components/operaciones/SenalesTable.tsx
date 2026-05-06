import { OperacionRow } from "./OperacionRow";
import type { OperacionItem, SortDir } from "./types";

/** Tabla de Señales M&A. Cabecera con sort por fecha/ingresos/ebitda. Renderiza
 *  estados de loading/error/empty y, en feliz, una `OperacionRow` por item. */
export function SenalesTable({
  loading,
  error,
  items,
  expandedId,
  setExpandedId,
  sortKey,
  sortDir,
  onSort,
  onVerPerfil,
}: {
  loading: boolean;
  error: string | null;
  items: OperacionItem[];
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  onVerPerfil: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-wr-muted text-sm animate-pulse">Cargando señales…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-red-400 text-sm">Error: {error}</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-wr-muted text-sm">Sin señales para los filtros seleccionados.</p>
      </div>
    );
  }

  const SortIcon = ({ k }: { k: string }) =>
    sortKey !== k ? (
      <span className="text-wr-border ml-0.5">↕</span>
    ) : (
      <span className="text-wr-blue ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
    );

  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="bg-wr-surface border-b border-wr-border text-wr-hint">
          <th
            className="px-3 py-2 text-left font-medium cursor-pointer hover:text-wr-text whitespace-nowrap"
            onClick={() => onSort("fecha")}
          >
            Fecha <SortIcon k="fecha" />
          </th>
          <th className="px-3 py-2 text-left font-medium">Tipo</th>
          <th className="px-3 py-2 text-left font-medium">Empresa</th>
          <th className="px-3 py-2 text-left font-medium">Adquirente</th>
          <th
            className="px-3 py-2 text-right font-medium cursor-pointer hover:text-wr-text whitespace-nowrap"
            onClick={() => onSort("ingresos")}
          >
            Ingresos <SortIcon k="ingresos" />
          </th>
          <th
            className="px-3 py-2 text-right font-medium cursor-pointer hover:text-wr-text whitespace-nowrap"
            onClick={() => onSort("ebitda")}
          >
            EBITDA <SortIcon k="ebitda" />
          </th>
          <th className="px-3 py-2 text-right font-medium text-[9px]">GM%</th>
          <th className="px-3 py-2 text-center font-medium w-8"></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <OperacionRow
            key={item.id}
            item={item}
            isExpanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            onVerPerfil={onVerPerfil}
          />
        ))}
      </tbody>
    </table>
  );
}
