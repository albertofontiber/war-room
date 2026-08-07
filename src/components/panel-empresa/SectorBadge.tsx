"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AMBITO_LABEL,
  listaHabilitaciones,
  parseHabilitaciones,
} from "@/lib/policia/habilitaciones";
import { SECTOR_LABEL } from "./constants";

/**
 * Distintivo de sector, con las habilitaciones de seguridad privada al pasar
 * el ratón.
 *
 * El detalle cuelga de este distintivo y no de uno propio porque un
 * "Autonómica" suelto en la fila no dice de qué es autonómica. El sector ya
 * identifica la actividad, así que es su sitio natural: el mismo patrón que
 * el distintivo de Cepreven, que resume y deja el desglose en el hover.
 */
export function SectorBadge({
  sector,
  habilitaciones,
}: {
  sector: string;
  habilitaciones: unknown;
}) {
  const lista = listaHabilitaciones(parseHabilitaciones(habilitaciones));

  const distintivo = (
    <Badge
      variant="outline"
      className="text-[10px] bg-wr-surface2 text-wr-muted border-wr-border"
    >
      {SECTOR_LABEL[sector] ?? sector}
    </Badge>
  );

  if (!lista.length) return distintivo;

  return (
    <TooltipProvider>
      <Tooltip>
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
              Seguridad privada · {lista.length}{" "}
              {lista.length === 1 ? "habilitación" : "habilitaciones"}
            </div>
            <ul className="space-y-0.5">
              {lista.map(({ habilitacion, ambito }) => (
                <li key={habilitacion.codigo} className="flex gap-1.5">
                  <span className="text-wr-blue leading-none">·</span>
                  <span>
                    {habilitacion.etiqueta}{" "}
                    <span className="text-wr-muted">({AMBITO_LABEL[ambito]})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
