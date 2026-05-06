import { fmt } from "@/lib/format";
import type { EmpresaDetalle } from "@/types";
import { SectionLabel, KpiRow } from "./primitives";

export function DatosGenerales({
  empresa,
  modoPresentacion,
}: {
  empresa: EmpresaDetalle;
  modoPresentacion: boolean;
}) {
  return (
    <div>
      <SectionLabel>Datos generales</SectionLabel>
      <div className="space-y-0.5">
        <KpiRow label="CIF" value={modoPresentacion ? "—" : empresa.cif} />
        <KpiRow label="Empleados" value={fmt(empresa.empleados)} />
        {empresa.servicios.length > 0 && (
          <div className="py-1">
            <span className="text-wr-hint text-xs">Servicios</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {empresa.servicios.map((s) => (
                <span
                  key={s}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-wr-surface2 text-wr-muted border border-wr-border"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {empresa.linkedin && (
          <div className="flex items-center justify-between py-1">
            <span className="text-wr-hint text-xs">LinkedIn</span>
            <a
              href={empresa.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-wr-blue text-xs hover:underline truncate max-w-[180px]"
            >
              Ver perfil ↗
            </a>
          </div>
        )}
        {empresa.score !== null && (
          <KpiRow label="Score" value={empresa.score.toFixed(1)} />
        )}
      </div>
    </div>
  );
}
