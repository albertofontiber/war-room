import type { FiltrosActivos } from "@/types";

export type RawProps = Record<string, unknown>;

export function isInFilter(
  p: RawProps,
  f: FiltrosActivos,
  search: string
): boolean {
  if (f.enPerimetro !== null && Boolean(p.enPerimetro) !== f.enPerimetro) return false;
  if (f.ccaa.length && !f.ccaa.includes(p.ccaa as string)) return false;
  if (f.provincia.length && !f.provincia.includes(p.provincia as string)) return false;
  if (f.sector.length && !f.sector.includes(p.sector as never)) return false;
  if (f.grupoId.length) {
    const gId = p.grupoId as number | null;
    if (gId === null || !f.grupoId.includes(gId)) return false;
  }
  if (f.crmStage.length) {
    const stage = p.dealStage as string | null;
    if (!stage || !f.crmStage.includes(stage as never)) return false;
  }
  if (f.cepreven !== null && Boolean(p.cepreven) !== f.cepreven) return false;
  if (f.aerme !== null && Boolean(p.aerme) !== f.aerme) return false;
  const ingresos = p.ingresos as number | null;
  if (ingresos === null) {
    // Sin datos financieros: excluir si el usuario ha puesto un mínimo
    if (f.ingresosMin > 0) return false;
  } else {
    if (ingresos < f.ingresosMin || ingresos > f.ingresosMax) return false;
  }
  const mbPct = p.margenBrutoPct as number | null;
  if (mbPct === null) {
    if (f.margenBrutoMin > 0) return false;
  } else {
    // min=0 significa "sin límite inferior" (no excluir empresas con margen negativo)
    if (f.margenBrutoMin > 0 && mbPct < f.margenBrutoMin) return false;
    // max=100 (tope del slider) = sin límite superior
    if (f.margenBrutoMax < 100 && mbPct > f.margenBrutoMax) return false;
  }
  const ebitdaPct = p.ebitdaPct as number | null;
  if (ebitdaPct === null) {
    if (f.ebitdaMin > 0) return false;
  } else {
    // min=0 significa "sin límite inferior" (no excluir empresas con EBITDA negativo)
    if (f.ebitdaMin > 0 && ebitdaPct < f.ebitdaMin) return false;
    if (ebitdaPct > f.ebitdaMax) return false;
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    const nombre = ((p.nombre as string) ?? "").toLowerCase();
    const cif = ((p.cif as string) ?? "").toLowerCase();
    if (!nombre.includes(q) && !cif.includes(q)) return false;
  }
  return true;
}
