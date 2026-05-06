import type { Adquirente } from "./types";

/** Celda con el adquirente de una operación. Tres modos:
 *   - grupo conocido → azul, opcionalmente "via {persona detectada}"
 *   - empresa extraída del texto (no mapeada a grupo) → ámbar
 *   - desconocido → guion gris */
export function AdquirenteCell({ adquirente }: { adquirente: Adquirente }) {
  if (adquirente.tipo === "grupo_conocido") {
    return (
      <span className="text-wr-blue font-medium">
        {adquirente.grupoNombre}
        {adquirente.personaDetectada && (
          <span className="text-wr-hint font-normal ml-1 text-[9px]">
            via {adquirente.personaDetectada.split(" ").slice(0, 2).join(" ")}
          </span>
        )}
      </span>
    );
  }
  if (adquirente.tipo === "empresa_extraida") {
    return (
      <span className="text-wr-amber text-[10px]">{adquirente.empresaNombre}</span>
    );
  }
  return <span className="text-wr-hint italic text-[10px]">—</span>;
}
