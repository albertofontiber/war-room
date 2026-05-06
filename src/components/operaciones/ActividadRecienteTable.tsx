import { fmtFechaShort } from "@/lib/format";
import { TipoPill } from "./TipoPill";
import { fmtM } from "./helpers";
import type { RecienteItem } from "./types";

/** Tabla simple de actividad reciente — todos los actos BORME de los últimos
 *  90 días sin filtrado por relevancia. Filas zebra para densidad visual. */
export function ActividadRecienteTable({
  items,
  onVerPerfil,
}: {
  items: RecienteItem[];
  onVerPerfil: (id: number) => void;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="bg-wr-surface border-b border-wr-border text-wr-hint">
          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Fecha</th>
          <th className="px-3 py-2 text-left font-medium">Tipo</th>
          <th className="px-3 py-2 text-left font-medium">Empresa</th>
          <th className="px-3 py-2 text-left font-medium">Provincia</th>
          <th className="px-3 py-2 text-left font-medium">Grupo</th>
          <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Ingresos</th>
          <th className="px-3 py-2 text-center font-medium w-8"></th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr
            key={item.id}
            className={`border-b border-wr-border text-xs transition-colors hover:bg-wr-surface2 ${
              idx % 2 === 0 ? "" : "bg-wr-surface/30"
            }`}
          >
            <td className="px-3 py-2 text-[11px] text-wr-hint whitespace-nowrap">
              {fmtFechaShort(item.fecha)}
            </td>
            <td className="px-3 py-2">
              <TipoPill tipo={item.tipoActo} />
            </td>
            <td className="px-3 py-2 max-w-[260px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  onClick={() => onVerPerfil(item.empresa.id)}
                  className="font-medium text-wr-text hover:text-wr-blue transition-colors truncate text-left"
                  title={item.empresa.nombre}
                >
                  {item.empresa.nombre}
                </button>
                {item.empresa.enPerimetro && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-wr-blue flex-shrink-0"
                    title="En perímetro"
                  />
                )}
              </div>
            </td>
            <td className="px-3 py-2 text-[11px] text-wr-muted whitespace-nowrap">
              {item.empresa.provincia ?? "—"}
            </td>
            <td className="px-3 py-2">
              {item.grupoNombre ? (
                <span className="text-[9px] text-wr-blue border border-wr-blue/30 px-1.5 py-0.5 rounded whitespace-nowrap">
                  {item.grupoNombre}
                </span>
              ) : (
                <span className="text-wr-border">—</span>
              )}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-wr-text">
              {fmtM(item.empresa.ingresos)}
              {item.empresa.anioFinanciero && (
                <span className="text-wr-hint text-[9px] ml-1">
                  {String(item.empresa.anioFinanciero).slice(2)}
                </span>
              )}
            </td>
            <td className="px-3 py-2 text-center">
              {item.urlBorme ? (
                <a
                  href={item.urlBorme}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-wr-hint hover:text-wr-blue text-[10px]"
                >
                  ↗
                </a>
              ) : (
                <span className="text-wr-border">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
