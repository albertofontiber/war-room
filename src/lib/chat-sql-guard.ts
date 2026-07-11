// ─── Guard del tool execute_sql del chat IA ──────────────────────────────────
// Primera capa de defensa: solo se aceptan queries que empiezan por SELECT y
// no contienen keywords de escritura/DDL. La capa estructural es el rol
// Postgres de solo lectura de `chat-db.ts` — aunque una query esquivara este
// filtro, la BD rechazaría cualquier escritura por permisos.
//
// Extraído de src/app/api/chat/route.ts para poder testearlo unitariamente
// (los route files de Next.js solo pueden exportar handlers/config).

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

export function validateSQL(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+$/, "").trim();
  if (!trimmed.toUpperCase().startsWith("SELECT")) return false;
  if (FORBIDDEN.test(trimmed)) return false;
  return true;
}

export function addLimit(sql: string): string {
  const trimmed = sql.trim().replace(/;+$/, "");
  if (!/\bLIMIT\b/i.test(trimmed)) {
    return trimmed + " LIMIT 100";
  }
  return trimmed;
}
