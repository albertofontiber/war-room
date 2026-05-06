/**
 * Helpers puros para la vista OperacionesBorme. Wrappers de los formatters de
 * `@/lib/format` con dash "—" como placeholder consistente, y resolución del
 * color para el % de EBITDA (verde / texto / amarillo / rojo según rangos).
 */

import { fmtM as _fmtM, fmtPct as _fmtPct } from "@/lib/format";

export const fmtM = (v: number | null) => _fmtM(v, "—");
export const fmtPct = (v: number | null) => _fmtPct(v, "—");

export function ebitdaColor(v: number | null): string {
  if (v === null) return "text-wr-muted";
  if (v >= 15) return "text-green-400";
  if (v >= 5) return "text-wr-text";
  if (v >= 0) return "text-yellow-400";
  return "text-red-400";
}
