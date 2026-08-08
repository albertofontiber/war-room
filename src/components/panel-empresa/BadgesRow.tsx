import { Badge } from "@/components/ui/badge";
import { DEAL_STAGE_LABEL, DEAL_STAGE_PILL_CLASS } from "@/lib/crm";
import type { EmpresaDetalle } from "@/types";
import { CeprevenBadge } from "./CeprevenBadge";
import { SectorBadge } from "./SectorBadge";

export function BadgesRow({ empresa }: { empresa: EmpresaDetalle }) {
  const dealStage = empresa.crmEstado?.dealStage;
  const stageClass = dealStage
    ? DEAL_STAGE_PILL_CLASS[dealStage]
    : DEAL_STAGE_PILL_CLASS.identificado;

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* Lleva colgadas las habilitaciones de seguridad privada: el sector ya
          identifica la actividad, y un "Autonómica" suelto en la fila no
          diría de qué. */}
      <SectorBadge
        sector={empresa.sector}
        habilitaciones={empresa.habilitaciones}
        ripci={empresa.ripci}
      />
      {dealStage && (
        <Badge
          variant="outline"
          className={`text-[10px] border ${stageClass}`}
        >
          {DEAL_STAGE_LABEL[dealStage] ?? dealStage}
        </Badge>
      )}
      {empresa.cepreven && (
        <CeprevenBadge
          estado={empresa.cepreven}
          areas={empresa.ceprevenAreas}
        />
      )}
      {empresa.aerme && (
        <Badge
          variant="outline"
          className="text-[10px] bg-wr-amber/10 text-wr-amber border-wr-amber/30"
        >
          Aerme
        </Badge>
      )}
    </div>
  );
}
