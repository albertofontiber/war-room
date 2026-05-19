/**
 * Red de seguridad para texto markdown producido por el LLM del chat IA.
 *
 * El system prompt instruye al modelo a separar las filas de tabla con `\n`
 * y a precargar `\n\n` antes de los headings, pero los modelos no siempre
 * obedecen — especialmente con tablas, suelen "linealizar" varias filas en
 * una sola línea con el patrón `| h1 | h2 | |---|---| | r1 | r2 |` continuo.
 *
 * Esta función detecta esos casos y los reformatea para que `remark-gfm`
 * pueda parsearlos correctamente como tablas y headings. Idempotente:
 * si la entrada ya está bien formateada, sale igual.
 *
 * NO procesa contenido dentro de bloques de código (entre ``` ```), porque
 * ahí los pipes son texto literal, no markdown.
 */

/** Regex de un separador de tabla GFM: `|---|---|...|` con al menos `---`. */
const SEPARATOR_RE = /\|(?:\s*:?-{3,}:?\s*\|)+/;

/**
 * Si una línea contiene un separador de tabla en el interior (sin estar al
 * inicio de su propia línea), entonces la tabla está concatenada. La
 * dividimos en header + separator + filas usando el conteo de pipes del
 * header para detectar dónde acaba cada fila.
 */
function splitConcatenatedTableLine(line: string): string[] {
  const sepMatch = line.match(SEPARATOR_RE);
  if (!sepMatch || sepMatch.index === undefined) return [line];

  const sepStart = sepMatch.index;
  const separator = sepMatch[0];

  // El header son los pipes ANTES del separator. Buscar hacia atrás el primer
  // `|` que marque el inicio de la fila de cabecera. Asumimos que el header
  // está pegado al separator (posible espacio en medio).
  const beforeSep = line.substring(0, sepStart);

  // Encontrar el header: secuencia de pipes contiguos al final de beforeSep.
  // Usamos un regex que captura `(\|[^|\n]*)+\|` al final.
  const headerMatch = beforeSep.match(/((?:\|[^|\n]*)+\|)\s*$/);
  if (!headerMatch) return [line];

  const header = headerMatch[1];
  const colCount = (header.match(/\|/g)?.length ?? 0) - 1;
  if (colCount < 1) return [line];

  // Texto antes del header (preludio: texto narrativo previo a la tabla).
  const headerStart = beforeSep.length - headerMatch[0].length;
  const preludio = line.substring(0, headerStart).trimEnd();

  // Después del separator vienen las filas de datos (todas concatenadas).
  const sepEnd = sepStart + separator.length;
  const dataPart = line.substring(sepEnd);

  // Partir dataPart en filas: cada fila válida tiene (colCount + 1) pipes.
  const pipesPerRow = colCount + 1;
  const rows: string[] = [];
  let buffer = "";
  let pipeCount = 0;
  let i = 0;
  for (; i < dataPart.length; i++) {
    const ch = dataPart[i];
    buffer += ch;
    if (ch === "|") {
      pipeCount++;
      if (pipeCount === pipesPerRow) {
        rows.push(buffer.trim());
        buffer = "";
        pipeCount = 0;
      }
    }
  }

  // Lo que sobra después de la última fila completa es texto narrativo
  // post-tabla (epílogo). Sólo lo tratamos como tal si NO es una fila
  // parcial — heurística simple: si no contiene pipes, es epílogo.
  const epilogo = buffer.includes("|") ? "" : buffer.trim();
  const ultimaFilaParcial = buffer.includes("|") ? buffer.trim() : "";

  const out: string[] = [];
  if (preludio) out.push(preludio);
  out.push(header);
  out.push(separator);
  for (const row of rows) {
    if (row) out.push(row);
  }
  if (ultimaFilaParcial) out.push(ultimaFilaParcial);
  if (epilogo) out.push("", epilogo);

  return out;
}

/**
 * Inyecta `\n\n` antes de cualquier heading ATX (`#`, `##`, etc.) que esté
 * pegado a contenido anterior en la misma línea (ej: `"texto.## Heading"`).
 * No toca headings que ya están al inicio de línea.
 */
function ensureHeadingNewlines(text: string): string {
  // Lookbehind negativo: matchea `#{1,6} ` precedido por algo que NO sea
  // ni `\n` ni `#`. Excluir `#` es crítico: un heading ya bien formateado
  // `\n\n## Heading` tiene `#` antes de `# `, y sin el lookbehind partiríamos
  // el `##` por la mitad. Tampoco matcheamos al inicio del string (no hay
  // char previo) — no hace falta acción ahí.
  return text.replace(/(?<=[^\n#])(#{1,6} )/g, "\n\n$1");
}

/**
 * Punto de entrada. Aplica todas las normalizaciones en orden.
 */
export function normalizeChatMarkdown(text: string): string {
  if (!text) return text;

  // Procesar línea a línea, respetando bloques de código.
  const lines = text.split("\n");
  const out: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      continue;
    }
    if (inCodeBlock) {
      out.push(line);
      continue;
    }
    // Si la línea contiene un separator de tabla pero NO empieza con `|` o
    // contiene otros pipes antes del separator, probablemente está concatenada.
    if (SEPARATOR_RE.test(line)) {
      const split = splitConcatenatedTableLine(line);
      out.push(...split);
    } else {
      out.push(line);
    }
  }

  let result = out.join("\n");
  result = ensureHeadingNewlines(result);
  return result;
}
