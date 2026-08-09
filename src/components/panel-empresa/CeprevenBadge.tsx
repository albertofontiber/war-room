"use client";

import { Badge } from "@/components/ui/badge";
import { agruparPorFamilia, FAMILIA_LABEL } from "@/lib/cepreven/areas";
import { BadgeConDetalle } from "./BadgeConDetalle";

const CLASE_CALIFICADA = "bg-green-500/10 text-green-400 border-green-500/30";
const CLASE_ASOCIADA = "bg-wr-amber/10 text-wr-amber border-wr-amber/30";

/**
 * Distintivo Cepreven de la ficha.
 *
 * "Calificada" es un rango superior a "asociada": la empresa ha pasado la
 * auditoría de Cepreven en unas áreas concretas (rociadores de riesgo
 * ordinario, detección automática…), y son esas áreas las que se listan al
 * pulsarlo o pasar el ratón, agrupadas por familia.
 *
 * Una calificada sin áreas cargadas todavía cae en el mismo distintivo sin
 * desglose, que es como se comportaba antes de tener el detalle.
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
    <BadgeConDetalle
      distintivo={distintivo}
      etiqueta="Ver áreas de calificación"
      anchoMaximo={20}
    >
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
    </BadgeConDetalle>
  );
}
