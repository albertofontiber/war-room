// ─── Guard del tool execute_sql del chat IA ──────────────────────────────────
// Primera capa de defensa: solo se aceptan queries de lectura (SELECT o WITH …
// SELECT) sin keywords de escritura/DDL ni referencias a secretos. La capa
// estructural es el rol Postgres de solo lectura de `chat-db.ts` — aunque una
// query esquivara este filtro, la BD rechazaría cualquier escritura por
// permisos.
//
// Extraído de src/app/api/chat/route.ts para poder testearlo unitariamente
// (los route files de Next.js solo pueden exportar handlers/config).

// Con una sola sentencia que empieza por SELECT/WITH, lo único que puede
// escribir es un CTE con INSERT/UPDATE/DELETE/MERGE; el resto es cinturón.
// (No se añaden palabras cortas como DO: "Extintores do Miño" es un nombre.)
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|COPY)\b/i;

// Secretos y funciones de servidor. Mientras el rol read-only no esté activo,
// la conexión del chat puede leerlo todo: hashes de contraseña, tokens de
// reset o el vault de Supabase no deben poder salir por el chat.
const SENSITIVE =
  /(passwordHash|tokenHash|PasswordResetToken|supabase_vault|\bvault\s*\.|\bpg_read_|\bpg_ls_dir|\blo_import|\blo_export|\bdblink|\bpg_sleep|\bset_config|\bpg_terminate_backend|\bpg_cancel_backend|\bpg_authid|\bpg_shadow)/i;

export function validateSQL(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+$/, "").trim();
  // WITH se acepta para CTEs (consultas por periodos, varios pasos). Un CTE
  // que escribe (`WITH x AS (DELETE … RETURNING *)`) lo para FORBIDDEN.
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) return false;
  // Una sola sentencia: un `;` en medio abre la puerta a encadenar otra.
  if (trimmed.includes(";")) return false;
  if (FORBIDDEN.test(trimmed)) return false;
  if (SENSITIVE.test(trimmed)) return false;
  return true;
}

export const DEFAULT_LIMIT = 100;

export function addLimit(sql: string): string {
  const trimmed = sql.trim().replace(/;+$/, "");
  if (!/\bLIMIT\b/i.test(trimmed)) {
    return `${trimmed} LIMIT ${DEFAULT_LIMIT}`;
  }
  return trimmed;
}
