// ─── Conexión de SOLO LECTURA para el execute_sql del chat IA ────────────────
// Defensa en profundidad: el guard de `chat-sql-guard.ts` filtra por texto,
// pero la barrera real es esta conexión — usa el rol Postgres
// `warroom_chat_readonly` (GRANT SELECT + statement_timeout), así que aunque
// una query esquivara el filtro, la BD rechazaría cualquier escritura.
//
// El rol se crea con `scripts/create-chat-readonly-role.ts`. La URL viene de
// la env `CHAT_READONLY_DATABASE_URL`. Sin ella se deshabilita execute_sql:
// el filtro textual no sustituye los permisos de la base de datos.

import { PrismaClient } from "@prisma/client";

const globalForChatDb = globalThis as unknown as {
  chatReadonlyDb?: PrismaClient;
};

function buildClient(): PrismaClient | null {
  const url = process.env.CHAT_READONLY_DATABASE_URL;
  if (!url) return null;
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * Cliente Prisma para las queries del tool `execute_sql`. Solo lectura si
 * `CHAT_READONLY_DATABASE_URL` está configurada; si no, falla de forma segura.
 */
export function getChatDb(): PrismaClient {
  if (!globalForChatDb.chatReadonlyDb) {
    const client = buildClient();
    if (client) {
      globalForChatDb.chatReadonlyDb = client;
    } else {
      throw new Error("Consulta SQL no disponible: falta configurar la conexión de solo lectura.");
    }
  }
  return globalForChatDb.chatReadonlyDb;
}
