/**
 * normalize.ts
 * Funciones de normalización compartidas entre scraping, BORME y validación.
 *
 * REGLA: cualquier código que genere o compare claves PersonaCargo.nombreNorm
 * DEBE importar normalizePersona() desde aquí. Nunca duplicar la lógica.
 */

// ── Partículas a eliminar en normalización de personas físicas ────────────────
export const PARTICULAS = new Set([
  'DE', 'DEL', 'DE LA', 'DE LOS', 'DE LAS', 'LA', 'LOS', 'LAS', 'EL', 'Y',
]);

// ── Sufijos mercantiles a eliminar en normalización de personas jurídicas ──────
export const SUFIJOS_JURIDICOS =
  /\b(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?C\.?P\.?|S\.?COOP\.?|S\.?L\.?P\.?|SLU|SAU|SA|SL|SC|COOP|SCP|SLP)\s*$/i;

/**
 * Normaliza el nombre de una persona (física o jurídica) para usarlo como clave
 * en PersonaCargo.nombreNorm.
 *
 * Personas físicas:
 *   - Guiones → espacio  ("Luis-Roberto" → "Luis Roberto")
 *   - Elimina tildes y caracteres no alfabéticos
 *   - Mayúsculas
 *   - Filtra partículas (DE, DEL, DE LA, etc.)
 *   - Ordena tokens alfabéticamente → clave canónica independiente del orden de fuente
 *   Ejemplo: "David López López" → "DAVID LOPEZ LOPEZ"
 *            "De La Pascua Aragón Pablo" → "ARAGON PABLO PASCUA"
 *
 * Personas jurídicas (esJuridica = true):
 *   - Elimina sufijo mercantil (SL, SA, SLU, etc.)
 *   - Elimina tildes y caracteres no alfanuméricos
 *   - Mayúsculas, espacios colapsados (NO se ordenan tokens — el nombre de una
 *     empresa es una unidad semántica, no una lista de tokens intercambiables)
 *   Ejemplo: "GRUFAEM SL" → "GRUFAEM"
 *            "Cobra Instalaciones y Servicios, S.A." → "COBRA INSTALACIONES Y SERVICIOS"
 */
export function normalizePersona(raw: string, esJuridica = false): string {
  if (esJuridica) {
    return raw
      .replace(SUFIJOS_JURIDICOS, '')
      .trim()
      .replace(/-/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9\s]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  const sinTildes = raw
    .replace(/-/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\s]/g, '')
    .toUpperCase()
    .trim();

  const tokens = sinTildes
    .split(/\s+/)
    .filter(t => t.length > 0 && !PARTICULAS.has(t));
  tokens.sort();
  return tokens.join(' ');
}

/**
 * Normalización simple para búsqueda de texto (BORME PDFs, descripciones).
 * NO ordena tokens — útil para buscar un nombre como substring en texto libre.
 * NO filtra partículas.
 *
 * Ejemplo: "Guitard Maldonado, Álvaro" → "GUITARD MALDONADO ALVARO"
 *
 * NOTA: Esta función NO produce claves PersonaCargo. Solo sirve para detección
 * de personas en texto BORME. Para claves PersonaCargo usar normalizePersona().
 */
export function normText(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convierte un nombre en formato "búsqueda BORME" al formato clave PersonaCargo.
 * Útil cuando borme-senales.ts devuelve personaDetectada y hay que escribir en PersonaCargo.
 *
 * Ejemplo: "GUITARD MALDONADO ALVARO" (borme-senales) → "ALVARO GUITARD MALDONADO" (PersonaCargo)
 */
export function bormePersonaToCargoKey(personaDetectada: string): string {
  return normalizePersona(personaDetectada, false);
}
