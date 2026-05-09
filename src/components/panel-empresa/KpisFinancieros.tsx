"use client";

import dynamic from "next/dynamic";
import { fmtM, fmtPct } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import type { EmpresaDetalle } from "@/types";
import { SectionLabel, KpiRow, TendenciaArrow } from "./primitives";

// `recharts` (~95 KB gzip) sólo se carga cuando hay >1 año de financieros y
// el panel está abierto. La mayoría de aperturas del panel no llegan a este
// chart, así que vale la pena hacerlo dynamic.
const HistoricoChart = dynamic(
  () => import("./HistoricoChart").then((mod) => ({ default: mod.HistoricoChart })),
  { ssr: false }
);

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
