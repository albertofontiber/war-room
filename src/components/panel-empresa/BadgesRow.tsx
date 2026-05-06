import { Badge } from "@/components/ui/badge";
import { DEAL_STAGE_LABEL, DEAL_STAGE_PILL_CLASS } from "@/lib/crm";
import type { EmpresaDetalle } from "@/types";
import { SECTOR_LABEL } from "./constants";

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
        <Badge
          variant="outline"
          className={`text-[10px] border ${empresa.cepreven === "calificada" ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-wr-amber/10 text-wr-amber border-wr-amber/30"}`}
        >
          Cepreven {empresa.cepreven === "calificada" ? "✓" : ""}
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
