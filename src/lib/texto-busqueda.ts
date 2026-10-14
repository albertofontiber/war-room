/**
 * Helpers puros de la búsqueda de texto libre del chat IA (`buscar_texto`).
 * La BD no tiene la extensión `unaccent`: la insensibilidad a tildes se hace
 * con `translate()` en SQL y con `normalizarTexto` aquí, con la MISMA tabla.
 */

export const ACENTOS_DESDE = "áàäâãéèëêíìïîóòöôõúùüûñç";
export const ACENTOS_HASTA = "aaaaaeeeeiiiiooooouuuunc";

export function normalizarTexto(s: string): string {
  let out = "";
  // Carácter a carácter y sin cambiar la longitud (algún toLowerCase, como
  // el de "İ", devuelve 2 caracteres): `fragmento` depende de que los índices
  // del normalizado y del original coincidan.
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const c = lower.length === ch.length ? lower : ch;
    const i = ACENTOS_DESDE.indexOf(c);
    out += i >= 0 ? ACENTOS_HASTA[i] : c;
  }
  return out;
}

/**
 * Parte la query en términos (todos deben aparecer, en cualquier orden).
 * Las comillas agrupan frases: `"carta de intenciones" tesein` → 2 términos.
 * Descarta términos de menos de 2 caracteres.
 */
export function terminosBusqueda(query: string): string[] {
  const terminos: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const t = normalizarTexto((m[1] ?? m[2]).trim());
    if (t.length >= 2) terminos.push(t);
  }
  return [...new Set(terminos)];
}

function escaparRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Patrón POSIX (operador `~` de Postgres) que exige que el término empiece en
 * inicio de palabra: "nda" encuentra "NDA" pero no "segunda" ni "mandar", y
 * "extin" encuentra "extintores" y "extinción". `\m` = inicio de palabra.
 */
export function patronInicioPalabra(t: string): string {
  return `\\m${escaparRegex(t)}`;
}

/**
 * Fragmento del texto alrededor de la primera coincidencia de cualquier
 * término, con `radio` caracteres a cada lado. Los índices de `normalizarTexto`
 * coinciden 1:1 con el original (solo sustituye caracteres), así que se puede
 * buscar en el normalizado y cortar el original.
 */
export function fragmento(texto: string, terminos: string[], radio = 120): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  const norm = normalizarTexto(limpio);
  let pos = -1;
  for (const t of terminos) {
    // Misma regla que el SQL: el término empieza en inicio de palabra.
    const m = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaparRegex(t)}`, "u").exec(norm);
    const i = m ? m.index + m[1].length : -1;
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) return limpio.length > radio * 2 ? `${limpio.slice(0, radio * 2)}…` : limpio;
  const ini = Math.max(0, pos - radio);
  const fin = Math.min(limpio.length, pos + radio);
  return `${ini > 0 ? "…" : ""}${limpio.slice(ini, fin)}${fin < limpio.length ? "…" : ""}`;
}
