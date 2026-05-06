import type { SubVista } from "./types";

/** Banner explicativo bajo la TopBar. Texto distinto por sub-vista. Oculto
 *  en mobile (`hidden sm:block`) para no comer altura útil de la tabla. */
export function DescriptionBanner({ subVista }: { subVista: SubVista }) {
  return (
    <div className="hidden sm:block flex-shrink-0 px-4 py-2 border-b border-wr-border/50 bg-wr-surface/40">
      {subVista === "senales" ? (
        <p className="text-[10px] text-wr-hint">
          <span className="font-medium text-wr-muted">Señales M&A</span>
          {" "}— Fusiones, adquisiciones y movimientos societarios detectados en el BORME para empresas del perímetro.
          Las filas en <span className="text-orange-300">naranja</span> (
          <span className="text-orange-300 font-medium">Posible adq.</span>) indican que una persona clave de un{" "}
          <span className="font-medium text-wr-text">grupo conocido</span> (Grupo Fire, Eurofesa, Scutum…) aparece en una empresa aún no mapeada a ese grupo — posible nueva adquisición en curso.
          Haz clic en una fila para ver la descripción completa del acto.
        </p>
      ) : subVista === "alertas_personas" ? (
        <p className="text-[10px] text-wr-hint">
          <span className="font-medium text-wr-muted">Alertas personas</span>
          {" "}— Personas detectadas en actos de nombramiento de 2 o más sociedades distintas, no incluidas en los grupos ya identificados.
          Pueden indicar un consolidador activo no catalogado. Cada bloque agrupa las sociedades donde aparece la misma persona.
        </p>
      ) : (
        <p className="text-[10px] text-wr-hint">
          <span className="font-medium text-wr-muted">Actividad reciente</span>
          {" "}— Todos los actos BORME de los últimos 90 días para empresas de nuestro universo, incluyendo nombramientos genéricos, disoluciones y otros actos societarios. A diferencia de «Señales M&A», muestra la actividad completa sin filtrar por relevancia.
        </p>
      )}
    </div>
  );
}
