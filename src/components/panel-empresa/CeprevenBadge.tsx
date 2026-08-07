"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { agruparPorFamilia, FAMILIA_LABEL } from "@/lib/cepreven/areas";

const CLASE_CALIFICADA = "bg-green-500/10 text-green-400 border-green-500/30";
const CLASE_ASOCIADA = "bg-wr-amber/10 text-wr-amber border-wr-amber/30";

/**
 * Distintivo Cepreven de la ficha.
 *
 * "Calificada" es un rango superior a "asociada": la empresa ha pasado la
 * auditoría de Cepreven en unas áreas concretas (rociadores de riesgo
 * ordinario, detección automática…), y son esas áreas las que se listan al
 * pasar el ratón, agrupadas por familia.
 *
 * Una calificada sin áreas cargadas todavía cae en el mismo distintivo sin
 * tooltip, que es como se comportaba antes de tener el detalle.
 */
export function CeprevenBadge({
  estado,
  areas,
}: {
  estado: string;
  areas: readonly string[];
}) {
  const calificada = estado === "calificada";
  const grupos = calificada ? agruparPorFamilia(areas) : [];

  const distintivo = (
    <Badge
      variant="outline"
      className={`text-[10px] border ${calificada ? CLASE_CALIFICADA : CLASE_ASOCIADA}`}
    >
      Cepreven {calificada ? "✓" : ""}
    </Badge>
  );

  if (!grupos.length) return distintivo;

  return (
    <TooltipProvider>
      <Tooltip>
        {/* `render` sustituye el <button> que pinta base-ui por defecto: aquí
            no hay nada que pulsar, solo información. El `tabIndex` es
            imprescindible: sin él el <span> no recibe foco y las áreas serían
            inalcanzables sin ratón. */}
        {/* `inline-flex`: siendo un <span> normal, el distintivo se apoyaría en
            la línea base del texto y quedaría más bajo que el resto de la fila. */}
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              className="inline-flex rounded outline-none focus-visible:ring-1 focus-visible:ring-wr-blue cursor-help"
            />
          }
        >
          {distintivo}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs items-start">
          <div className="space-y-2 py-0.5">
            <div className="font-medium text-wr-text">
              Calificación Cepreven · {areas.length}{" "}
              {areas.length === 1 ? "área" : "áreas"}
            </div>
            {grupos.map(({ familia, areas: delGrupo }) => (
              <div key={familia}>
                {/* Mismo tratamiento que `SectionLabel`, el rótulo de sección
                    que usa el resto de la ficha. */}
                <div className="text-[10px] font-semibold uppercase tracking-widest text-wr-muted">
                  {FAMILIA_LABEL[familia]}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {delGrupo.map((a) => (
                    <li key={a.codigo} className="flex gap-1.5">
                      <span className="text-wr-green leading-none">·</span>
                      <span>{a.etiqueta}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
