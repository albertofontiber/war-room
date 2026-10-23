"use client";

import dynamic from "next/dynamic";
import { fmtM, fmtPct } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import type { EmpresaDetalle } from "@/types";
import { avisosFinancieros, type AvisoFinanciero } from "@/lib/empresa-estado";
import { SectionLabel, KpiRow, TendenciaArrow } from "./primitives";

// `recharts` (~95 KB gzip) sólo se carga cuando hay >1 año de financieros y
// el panel está abierto. La mayoría de aperturas del panel no llegan a este
// chart, así que vale la pena hacerlo dynamic.
const HistoricoChart = dynamic(
  () => import("./HistoricoChart").then((mod) => ({ default: mod.HistoricoChart })),
  { ssr: false }
);

function Avisos({ avisos }: { avisos: AvisoFinanciero[] }) {
  if (avisos.length === 0) return null;
  return (
    <div className="mb-2 space-y-1">
      {avisos.map((a) => (
        <p
          key={a.texto}
          className={
            a.nivel === "alerta"
              ? "rounded border border-wr-amber/30 bg-wr-amber/5 px-2 py-1 text-xs text-wr-amber"
              : "text-xs text-wr-muted"
          }
        >
          {a.texto}
        </p>
      ))}
    </div>
  );
}

export function KpisFinancieros({ empresa }: { empresa: EmpresaDetalle }) {
  const latestFin = empresa.financieros[0] ?? null;
  // Los leads anónimos no tienen CIF real: no hay nada que consultar en SABI.
  if (empresa.esAnonima && !latestFin) return null;

  const avisos = avisosFinancieros({
    estado: empresa.estado,
    ultimoAnio: latestFin?.anio ?? null,
    anioActual: new Date().getFullYear(),
  });

  if (!latestFin) {
    return (
      <>
        <div>
          <SectionLabel>Financieros</SectionLabel>
          <Avisos avisos={avisos} />
        </div>
        <Separator className="bg-wr-border" />
      </>
    );
  }

  return (
    <>
      <div>
        <SectionLabel>
          Financieros ({latestFin.anio})
        </SectionLabel>
        <Avisos avisos={avisos} />
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
