"use client";

import { Badge } from "@/components/ui/badge";
import {
  AMBITO_LABEL,
  listaHabilitaciones,
  parseHabilitaciones,
} from "@/lib/policia/habilitaciones";
import { parseRipci, SECCION_LABEL, type SeccionRipci } from "@/lib/ripci/categorias";
import { BadgeConDetalle } from "./BadgeConDetalle";
import { SECTOR_LABEL } from "./constants";

/**
 * Distintivo de sector, con las habilitaciones de seguridad privada al
 * pulsarlo o pasar el ratón.
 *
 * El detalle cuelga de este distintivo y no de uno propio porque un
 * "Autonómica" suelto en la fila no dice de qué es autonómica. El sector ya
 * identifica la actividad, así que es su sitio natural: el mismo patrón que
 * el distintivo de Cepreven, que resume y deja el desglose dentro.
 */
export function SectorBadge({
  sector,
  habilitaciones,
  ripci,
}: {
  sector: string;
  habilitaciones: unknown;
  ripci: unknown;
}) {
  const lista = listaHabilitaciones(parseHabilitaciones(habilitaciones));
  const contraIncendios = parseRipci(ripci);

  const distintivo = (
    <Badge
      variant="outline"
      className="text-[10px] bg-wr-surface2 text-wr-muted border-wr-border"
    >
      {SECTOR_LABEL[sector] ?? sector}
    </Badge>
  );

  if (!lista.length && !contraIncendios) return distintivo;

  return (
    <BadgeConDetalle
      distintivo={distintivo}
      etiqueta="Ver habilitaciones y categorías"
      anchoMaximo={24}
    >
      <div className="space-y-3 py-0.5">
        {lista.length > 0 && (
          <div className="space-y-1">
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
        )}

        {contraIncendios && (
          <div className="space-y-1.5">
            <div className="font-medium text-wr-text">Contra incendios · RIPCI</div>
            {(["instalacion", "mantenimiento"] as SeccionRipci[])
              .filter((s) => contraIncendios[s].length > 0)
              .map((s) => (
                <div key={s}>
                  {/* Mismo rótulo que las secciones del resto de la ficha. */}
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-wr-muted">
                    {SECCION_LABEL[s]} · {contraIncendios[s].length}
                  </div>
                  {/* En línea y no en lista: una empresa con habilitación
                      completa tiene 13 categorías de instalación y 14 de
                      mantenimiento, y en viñetas el recuadro se iría de
                      alto. */}
                  <p className="mt-0.5 leading-snug">
                    {contraIncendios[s].join(" · ")}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </BadgeConDetalle>
  );
}
