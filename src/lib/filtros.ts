import type { FiltrosActivos } from "@/types";
import type { EmpresaFeatureProperties } from "@/store/useWarRoomStore";

/**
 * Shape esperado para `isInFilter`. Típicamente es `EmpresaFeatureProperties`
 * del endpoint `/api/empresas`, pero exportamos un alias para no acoplar el
 * filter al store.
 */
export type RawProps = EmpresaFeatureProperties;

export function isInFilter(
  p: RawProps,
  f: FiltrosActivos,
  search: string
): boolean {
  if (f.enPerimetro !== null && p.enPerimetro !== f.enPerimetro) return false;
  if (f.ccaa.length && (p.ccaa === null || !f.ccaa.includes(p.ccaa))) return false;
  if (f.provincia.length && (p.provincia === null || !f.provincia.includes(p.provincia))) return false;
  if (f.sector.length && (p.sector === null || !f.sector.includes(p.sector))) return false;
  if (f.grupoId.length) {
    // Sentinel `0` representa "sin grupo asignado". Si la empresa no tiene
    // grupo (p.grupoId === null), pasa SOLO si 0 está en el array. Si tiene
    // grupo, debe estar en el array de IDs.
    if (p.grupoId === null) {
      if (!f.grupoId.includes(0)) return false;
    } else {
      if (!f.grupoId.includes(p.grupoId)) return false;
    }
  }
  if (f.crmStage.length) {
    // El array puede contener stages reales y el sentinel "sin_crm".
    // - "sin_crm" matchea empresas con dealStage null (sin CrmEstado o stage limpio).
    // - Stages reales matchean por igualdad estricta.
    const wantsSinCrm = f.crmStage.includes("sin_crm");
    if (!p.dealStage) {
      if (!wantsSinCrm) return false;
    } else {
      if (!f.crmStage.includes(p.dealStage)) return false;
    }
  }
  if (f.cepreven !== null) {
    const hasCep = p.cepreven != null && p.cepreven !== "";
    if (hasCep !== f.cepreven) return false;
  }
  if (f.aerme !== null && p.aerme !== f.aerme) return false;
  if (p.ingresos === null) {
    if (f.ingresosMin > 0) return false;
  } else {
    if (p.ingresos < f.ingresosMin || p.ingresos > f.ingresosMax) return false;
  }
  if (p.margenBrutoPct === null) {
    if (f.margenBrutoMin > 0) return false;
  } else {
    // min=0 significa "sin límite inferior" (no excluir empresas con margen negativo)
    if (f.margenBrutoMin > 0 && p.margenBrutoPct < f.margenBrutoMin) return false;
    // max=100 (tope del slider) = sin límite superior
    if (f.margenBrutoMax < 100 && p.margenBrutoPct > f.margenBrutoMax) return false;
  }
  if (p.ebitdaPct === null) {
    if (f.ebitdaMin > 0) return false;
  } else {
    // min=0 significa "sin límite inferior" (no excluir empresas con EBITDA negativo)
    if (f.ebitdaMin > 0 && p.ebitdaPct < f.ebitdaMin) return false;
    if (p.ebitdaPct > f.ebitdaMax) return false;
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    const nombre = p.nombre.toLowerCase();
    const cif = p.cif.toLowerCase();
    if (!nombre.includes(q) && !cif.includes(q)) return false;
  }
  return true;
}
