import type { OperacionItem } from "./types";

/** Drawer de detalle (fila expandida) de una operación. Mantiene el `colSpan=8`
 *  alineado con la cabecera de la tabla principal de Señales. */
export function RowDetail({
  item,
  onClose,
}: {
  item: OperacionItem;
  onClose: () => void;
}) {
  return (
    <tr>
      <td colSpan={8} className="bg-wr-surface2 border-b border-wr-border px-4 py-3">
        <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-wr-muted leading-relaxed break-words">
              {item.descripcion ?? "Sin descripción"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 text-[10px] text-wr-hint">
            {item.empresa.ccaa && <span>{item.empresa.ccaa}</span>}
            {item.empresa.sector && <span>{item.empresa.sector}</span>}
            {item.urlBorme && (
              <a
                href={item.urlBorme}
                target="_blank"
                rel="noopener noreferrer"
                className="text-wr-blue hover:underline"
              >
                Ver BORME ↗
              </a>
            )}
            <button
              onClick={onClose}
              className="text-wr-hint hover:text-wr-text ml-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
