import { fmtM, fmtPct } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import type { EmpresaDetalle } from "@/types";
import { SectionLabel, KpiRow, TendenciaArrow } from "./primitives";
import { HistoricoChart } from "./HistoricoChart";

export function KpisFinancieros({ empresa }: { empresa: EmpresaDetalle }) {
  const latestFin = empresa.financieros[0] ?? null;
  if (!latestFin) return null;

  return (
    <>
      <div>
        <SectionLabel>
          Financieros ({latestFin.anio})
        </SectionLabel>
        <div className="space-y-0.5">
          <KpiRow
            label="Ingresos"
            value={fmtM(latestFin.ingresos)}
            trend={
              empresa.tendenciaIngresos ? (
                <TendenciaArrow
                  dir={empresa.tendenciaIngresos.direccion}
                  pct={empresa.tendenciaIngresos.variacionPct}
                />
              ) : undefined
            }
          />
          <KpiRow
            label="GM"
            value={fmtPct(latestFin.margenBrutoPct)}
            trend={
              empresa.tendenciaMargenBruto ? (
                <TendenciaArrow
                  dir={empresa.tendenciaMargenBruto.direccion}
                  pct={empresa.tendenciaMargenBruto.variacionPct}
                />
              ) : undefined
            }
          />
          <KpiRow
            label="EBITDA"
            value={fmtM(latestFin.ebitda)}
          />
          <KpiRow
            label="% EBITDA"
            value={fmtPct(latestFin.ebitdaPct)}
          />
          <KpiRow
            label="Resultado neto"
            value={fmtM(latestFin.resultadoNeto)}
          />
        </div>
      </div>

      {empresa.financieros.length > 1 && (
        <div>
          <SectionLabel>Histórico</SectionLabel>
          <HistoricoChart financieros={empresa.financieros} />
        </div>
      )}

      <Separator className="bg-wr-border" />
    </>
  );
}
