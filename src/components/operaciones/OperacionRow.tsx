import { fmtFechaShort } from "@/lib/format";
import { TipoPill } from "./TipoPill";
import { AdquirenteCell } from "./AdquirenteCell";
import { RowDetail } from "./RowDetail";
import { fmtM, fmtPct, ebitdaColor } from "./helpers";
import type { OperacionItem } from "./types";

/** Fila de la tabla principal de Señales M&A. Click toggle expand. Click en
 *  empresa abre la vista mapa con la empresa seleccionada. Click en web/BORME
 *  abre el link y NO debe disparar el toggle (stopPropagation). */
export function OperacionRow({
  item,
  isExpanded,
  onToggle,
  onVerPerfil,
}: {
  item: OperacionItem;
  isExpanded: boolean;
  onToggle: () => void;
  onVerPerfil: (id: number) => void;
}) {
  const isPosible = item.efectiveTipo === "posible_adquisicion";
  return (
    <>
      <tr
        onClick={onToggle}
        className={`group border-b transition-colors cursor-pointer text-xs ${
          isExpanded
            ? "bg-wr-surface2 border-wr-muted/30"
            : isPosible
              ? "border-wr-border bg-orange-500/5 hover:bg-orange-500/10"
              : "border-wr-border hover:bg-wr-surface2"
        }`}
      >
        <td className="px-3 py-2.5 text-[11px] text-wr-hint whitespace-nowrap">
          {fmtFechaShort(item.fecha)}
        </td>
        <td className="px-3 py-2.5">
          <TipoPill tipo={item.efectiveTipo} />
        </td>
        <td className="px-3 py-2.5 max-w-[220px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onVerPerfil(item.empresa.id);
              }}
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
            {item.empresa.web && (
              <a
                href={
                  item.empresa.web.startsWith("http")
                    ? item.empresa.web
                    : `https://${item.empresa.web}`
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-wr-hint hover:text-wr-blue transition-colors flex-shrink-0"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </a>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 max-w-[180px]">
          <AdquirenteCell adquirente={item.adquirente} />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-wr-text">
          {fmtM(item.empresa.ingresos)}
          {item.empresa.anioFinanciero && (
            <span className="text-wr-hint text-[9px] ml-1">
              {String(item.empresa.anioFinanciero).slice(2)}
            </span>
          )}
        </td>
        <td className={`px-3 py-2.5 text-right tabular-nums ${ebitdaColor(item.empresa.ebitdaPct)}`}>
          {fmtM(item.empresa.ebitda)}
          {item.empresa.ebitdaPct !== null && (
            <span className="ml-1 text-[9px] opacity-70">
              ({fmtPct(item.empresa.ebitdaPct)})
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-wr-muted text-[10px]">
          {fmtPct(item.empresa.margenBrutoPct)}
        </td>
        <td className="px-3 py-2.5 text-center">
          {item.urlBorme ? (
            <a
              href={item.urlBorme}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-wr-hint hover:text-wr-blue text-[10px]"
            >
              ↗
            </a>
          ) : (
            <span className="text-wr-border">—</span>
          )}
        </td>
      </tr>
      {isExpanded && <RowDetail item={item} onClose={onToggle} />}
    </>
  );
}
