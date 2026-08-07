import { Badge } from "@/components/ui/badge";
import { DEAL_STAGE_LABEL, DEAL_STAGE_PILL_CLASS } from "@/lib/crm";
import type { EmpresaDetalle } from "@/types";
import { SECTOR_LABEL } from "./constants";
import { CeprevenBadge } from "./CeprevenBadge";
import { HabilitacionesBadge } from "./HabilitacionesBadge";

export function BadgesRow({ empresa }: { empresa: EmpresaDetalle }) {
  const dealStage = empresa.crmEstado?.dealStage;
  const stageClass = dealStage
    ? DEAL_STAGE_PILL_CLASS[dealStage]
    : DEAL_STAGE_PILL_CLASS.identificado;

  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge
        variant="outline"
        className="text-[10px] bg-wr-surface2 text-wr-muted border-wr-border"
      >
        {SECTOR_LABEL[empresa.sector] ?? empresa.sector}
      </Badge>
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
      {/* Se pinta siempre que haya habilitaciones registradas. En la práctica
          son las de seguridad electrónica y mixtas, pero alguna de PCI también
          consta en el registro y no tiene sentido ocultárselo. */}
      <HabilitacionesBadge habilitaciones={empresa.habilitaciones} />
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
