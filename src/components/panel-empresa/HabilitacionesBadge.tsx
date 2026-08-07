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

/**
 * Distintivo de habilitaciones del Registro de Seguridad Privada.
 *
 * El ámbito es de cada habilitación, no de la empresa: se puede instalar con
 * licencia autonómica y tener la central de alarmas con licencia estatal. Por
 * eso el distintivo resume ("estatal", "autonómica" o "mixta") y el detalle
 * —qué habilitaciones y con qué alcance cada una— va al pasar el ratón, igual
 * que en el de Cepreven.
 */
export function HabilitacionesBadge({ habilitaciones }: { habilitaciones: unknown }) {
  const lista = listaHabilitaciones(parseHabilitaciones(habilitaciones));
  if (!lista.length) return null;

  const estatales = lista.filter((h) => h.ambito === "E").length;
  const resumen =
    estatales === lista.length
      ? "Estatal"
      : estatales === 0
        ? "Autonómica"
        : "Ámbito mixto";

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
          <Badge
            variant="outline"
            className="text-[10px] bg-wr-blue/10 text-wr-blue border-wr-blue/30"
          >
            {resumen}
          </Badge>
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
