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
        <TooltipTrigger
          render={<span tabIndex={0} className="cursor-help outline-none focus-visible:ring-1 focus-visible:ring-wr-blue rounded" />}
        >
          {distintivo}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs items-start">
          <div className="space-y-1.5 py-0.5">
            <div className="font-medium">
              Calificación Cepreven · {areas.length}{" "}
              {areas.length === 1 ? "área" : "áreas"}
            </div>
            {grupos.map(({ familia, areas: delGrupo }) => (
              <div key={familia}>
                <div className="opacity-60">{FAMILIA_LABEL[familia]}</div>
                <ul className="list-disc pl-3.5">
                  {delGrupo.map((a) => (
                    <li key={a.codigo}>{a.etiqueta}</li>
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
