/**
 * Parser y helpers de menciones (@) en contenido de Notas y Tareas.
 *
 * Formato persistido en el contenido de la nota/tarea:
 *
 *     @[Nombre Visible](u:abc123)   → mención a User (admin)
 *     @[Nombre Visible](f:xyz789)   → mención a Finder
 *
 * El nombre dentro de los corchetes es lo que se renderiza visualmente. El id
 * dentro del paréntesis es lo que el backend usa para resolver el destinatario
 * y crear la fila `Mencion` + disparar la notificación. Si dos personas se
 * llaman igual no hay ambigüedad — el id manda. Si alguien cambia su nombre
 * en el sistema, el contenido de la nota mantiene el nombre histórico (no
 * mentimos sobre lo que se escribió en su día); las notificaciones nuevas
 * usan el nombre actual.
 *
 * Por qué un formato estructurado en lugar de "@nombre" plano:
 *   - Robusto a homónimos (Alberto López vs Alberto Silva).
 *   - Soporta admins+finders sin colisión (prefijos `u:` / `f:`).
 *   - El render distingue mención válida (con id) de "@texto" suelto.
 *   - Edición preserva el marcador completo.
 *
 * Tradeoff: el contenido en BD es menos legible (`@[Alberto](u:abc)` vs `@Alberto`).
 * Acceptable porque siempre se renderiza vía `MentionRender` o se edita vía
 * `MentionTextarea` — el texto crudo no se ve en producción.
 */

export type MencionTarget = {
  kind: "u" | "f";
  id: string;
  /** Nombre visible al momento de mencionar — útil para notificaciones. */
  name: string;
};

// `[^\]]` para que el nombre no pueda contener `]` (rompería el corchete).
// `[a-zA-Z0-9_-]` para el id (cuid/uuid + chars seguros, sin paréntesis).
const MENCION_REGEX = /@\[([^\]]+)\]\((u|f):([a-zA-Z0-9_-]+)\)/g;

/**
 * Extrae todas las menciones del contenido. Dedup por (kind, id) — si
 * mencionas dos veces a la misma persona en el mismo texto, solo se notifica
 * una vez y solo se persiste una fila Mencion.
 */
export function extractMenciones(contenido: string): MencionTarget[] {
  const seen = new Set<string>();
  const out: MencionTarget[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex por si el caller reusa la regex (es global → mantiene state).
  MENCION_REGEX.lastIndex = 0;
  while ((match = MENCION_REGEX.exec(contenido)) !== null) {
    const [, name, kind, id] = match;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: kind as "u" | "f", id, name });
  }
  return out;
}

/**
 * Construye el marcador inline. Útil al insertar desde el UI autocomplete.
 * El nombre se sanea para que no rompa los corchetes.
 */
export function buildMencionMarker(target: { kind: "u" | "f"; id: string; name: string }): string {
  const safeName = target.name.replace(/[\[\]]/g, "");
  return `@[${safeName}](${target.kind}:${target.id})`;
}

/**
 * Reemplaza los marcadores `@[Name](kind:id)` por `@Name` puro. Útil para
 * previews en notificaciones, emails y cualquier sitio donde no se renderice
 * la mención visualmente.
 */
export function stripMencionMarkers(contenido: string): string {
  return contenido.replace(MENCION_REGEX, "@$1");
}
