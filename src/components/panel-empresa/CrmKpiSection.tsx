import { fmtDate } from "@/lib/format";
import type { EmpresaDetalle } from "@/types";
import { SectionLabel, KpiRow } from "./primitives";

export function CrmKpiSection({ empresa }: { empresa: EmpresaDetalle }) {
  if (!empresa.crmEstado) return null;
  return (
    <div>
      <SectionLabel>CRM</SectionLabel>
      <div className="space-y-0.5">
        {empresa.crmEstado.ownerUser?.name && (
          <KpiRow label="Owner" value={empresa.crmEstado.ownerUser.name} />
        )}
        <KpiRow
          label="Actualizado"
          value={fmtDate(empresa.crmEstado.updatedAt)}
        />
      </div>
    </div>
  );
}
