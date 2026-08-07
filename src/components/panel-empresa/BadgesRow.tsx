import { Badge } from "@/components/ui/badge";
import { DEAL_STAGE_LABEL, DEAL_STAGE_PILL_CLASS } from "@/lib/crm";
import type { EmpresaDetalle } from "@/types";
import { SECTOR_LABEL } from "./constants";
import { CeprevenBadge } from "./CeprevenBadge";

/** Habilitación de la empresa de seguridad: estatal o de una comunidad. */
const AMBITO_LABEL: Record<string, string> = {
  E: "Habilitación estatal",
  A: "Habilitación autonómica",
};

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
      {empresa.ambitoGeo && AMBITO_LABEL[empresa.ambitoGeo] && (
        <Badge
          variant="outline"
          className="text-[10px] bg-wr-blue/10 text-wr-blue border-wr-blue/30"
        >
          {AMBITO_LABEL[empresa.ambitoGeo]}
        </Badge>
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
