import type { Tendencia } from "@/types";

interface FinRow {
  anio: number;
  ingresos: number | null;
  margenBruto: number | null;
  ebitda: number | null;
  resultadoNeto?: number | null;
}

export interface TendenciaResult {
  direccion: Tendencia;
  variacionPct: number;
}

export function calcTendencia(
  financieros: FinRow[],
  campo: "ingresos" | "margenBruto" | "ebitda" = "ingresos"
): TendenciaResult | null {
  const sorted = [...financieros].sort((a, b) => b.anio - a.anio);
  const latest = sorted[0];
  const prev = sorted[1];

  const v1 = latest?.[campo] ?? null;
  const v2 = prev?.[campo] ?? null;

  if (v1 === null || v2 === null || v2 === 0) return null;

  const variacionPct = ((v1 - v2) / Math.abs(v2)) * 100;
  const direccion: Tendencia =
    variacionPct > 5 ? "up" : variacionPct < -5 ? "down" : "flat";

  return { direccion, variacionPct };
}

export function enrichFinancieros(financieros: FinRow[]) {
  return financieros.map((f) => ({
    anio: f.anio,
    ingresos: f.ingresos,
    margenBruto: f.margenBruto,
    margenBrutoPct:
      f.ingresos && f.margenBruto
        ? (f.margenBruto / f.ingresos) * 100
        : null,
    ebitda: f.ebitda,
    ebitdaPct:
      f.ingresos && f.ebitda ? (f.ebitda / f.ingresos) * 100 : null,
    resultadoNeto: f.resultadoNeto ?? null,
  }));
}
