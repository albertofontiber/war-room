/**
 * Extracción del nombre del adquirente desde el texto libre de un acto BORME.
 *
 * El BORME no estructura el adquirente en un campo dedicado: aparece tras
 * etiquetas como "Socio único:", "Sociedad absorbente:" o "Unipersonalidad.".
 * Estas regex capturan el siguiente bloque hasta el primer terminador
 * (`.`, `;`, salto de línea), pero pueden confundirse con OTRAS etiquetas
 * BORME que aparecen contiguas en el mismo acto (ej: "Unipersonalidad.
 * Ceses/Dimisiones: ...").
 *
 * `looksLikeCompanyName` filtra estos falsos positivos rechazando candidatos
 * que empiecen con palabras-clave de etiquetas BORME.
 */

/**
 * Palabras con las que empiezan etiquetas BORME (no nombres de empresa).
 * Si un candidato empieza por una de estas, lo descartamos.
 *
 * Casos cubiertos hasta ahora:
 *   - "Ceses/Dimisiones" tras "Unipersonalidad."
 *   - "Disolución y liquidación" tras "Sociedad absorbente:"
 *   - "Nombramientos:" tras "Socio único:"
 *   - Otros encabezados administrativos comunes
 */
const BORME_LABEL_PATTERN =
  /^(Socio|La\s|El\s|Se\s|Ces[eo]s?\b|Dimisi[oó]n|Nombram|Revoca|Modif|Adquis|Disol|Liquid|Sociedad|Empresa|Apoderad|Administr|Capital|Estatu|Cambio|Inscrip|Datos|Cierre|Convocat|Junta|Reduc|Amplia)/i;

/** Devuelve true si el candidato parece un nombre de empresa real (no una
 *  etiqueta BORME). Heurística conservadora: descarta strings demasiado
 *  cortos o que empiezan por palabras-clave conocidas de etiquetas. */
export function looksLikeCompanyName(candidate: string): boolean {
  if (candidate.length <= 3) return false;
  if (BORME_LABEL_PATTERN.test(candidate)) return false;
  return true;
}

/**
 * Extrae el nombre del adquirente del texto libre del BORME. Devuelve `null`
 * si no se identifica con confianza un nombre de empresa.
 *
 * Estrategia:
 *   1. "Socio único: NOMBRE."     → NOMBRE
 *   2. "Sociedad absorbente: X."  → X
 *   3. "Unipersonalidad. X."      → X (si X parece nombre de empresa)
 *
 * Cada match pasa por `looksLikeCompanyName` para evitar capturar etiquetas
 * BORME adyacentes (Ceses, Dimisiones, Nombramientos, etc.).
 */
export function extractAdquirente(descripcion: string | null): string | null {
  if (!descripcion) return null;
  const d = descripcion;

  // 1. "Socio único: NOMBRE SA." / "Socio Unico. NOMBRE"
  // Aceptamos "Único" con y sin tilde porque el BORME a veces lo escribe sin
  // (variantes regionales / OCR imperfecto en algunos PDFs antiguos).
  const socioMatch = d.match(
    /[Ss]ocio\s+[ÚúUu]nico[:\s.]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{2,60}?)(?:\.|;|\n|$)/
  );
  if (socioMatch) {
    const name = socioMatch[1].trim().replace(/[.,;]+$/, "");
    if (looksLikeCompanyName(name)) return name;
  }

  // 2. "Sociedad absorbente: NOMBRE" (fusiones)
  const absoMatch = d.match(
    /[Ss]ociedad\s+absorbente[:\s]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{2,60}?)(?:\.|;|\n|$)/
  );
  if (absoMatch) {
    const name = absoMatch[1].trim().replace(/[.,;]+$/, "");
    if (looksLikeCompanyName(name)) return name;
  }

  // 3. "Unipersonalidad. [Nombre]" — solo si el siguiente token parece un
  //    nombre de empresa. Antes este guard era más laxo (solo descartaba
  //    "Socio|La|El|Se") y dejaba pasar "Ceses/Dimisiones" como adquirente.
  const uniMatch = d.match(
    /[Uu]nipersonalidad[.\s]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{3,60}?)(?:\.|;|\n|$)/
  );
  if (uniMatch) {
    const candidate = uniMatch[1].trim().replace(/[.,;]+$/, "");
    if (looksLikeCompanyName(candidate)) return candidate;
  }

  return null;
}
