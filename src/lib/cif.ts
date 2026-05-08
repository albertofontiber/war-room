/**
 * Normalización de CIF / NIF.
 *
 * Patrón canónico: solo alfanuméricos, mayúsculas, sin guiones ni espacios.
 * Ejemplos:
 *   "B-31461593"       → "B31461593"
 *   "b 31461593"       → "B31461593"
 *   "40.272.116J"      → "40272116J"
 *
 * Aplicar SIEMPRE antes de un INSERT/UPDATE de `Empresa.cif` para evitar
 * duplicados con/sin guion (ver scripts/find-duplicate-empresas.ts).
 *
 * Nota: el placeholder de leads anónimos `LEAD-{id}` SÍ debe quedar
 * intacto porque ese guion es semántico (marca de lead). NO normalizar
 * los CIFs que empiezan por "LEAD-".
 */

export function normalizeCif(cif: string): string {
  if (cif.startsWith("LEAD-")) return cif;
  return cif.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Heurística mínima: 1 letra + 7 dígitos + 1 letra/dígito (CIF), o 8 dígitos
 * + 1 letra (NIF). NO valida la letra de control (ese check se haría con un
 * algoritmo adicional). Útil para descartar inputs claramente erróneos. */
export function looksLikeCif(cif: string): boolean {
  const n = normalizeCif(cif);
  return /^[A-Z]\d{7}[A-Z0-9]$|^\d{8}[A-Z]$/.test(n);
}
