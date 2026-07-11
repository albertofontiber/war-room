// ─── Conexión de SOLO LECTURA para el execute_sql del chat IA ────────────────
// Defensa en profundidad: el guard de `chat-sql-guard.ts` filtra por texto,
// pero la barrera real es esta conexión — usa el rol Postgres
// `warroom_chat_readonly` (GRANT SELECT + statement_timeout), así que aunque
// una query esquivara el filtro, la BD rechazaría cualquier escritura.
//
// El rol se crea con `scripts/create-chat-readonly-role.ts`. La URL viene de
// la env `CHAT_READONLY_DATABASE_URL`; si no está definida (p. ej. entorno
// nuevo sin configurar), hacemos fallback al cliente normal con un warn para
// no romper el chat — el guard de texto sigue activo.

import { PrismaClient } from "@prisma/client";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const globalForChatDb = globalThis as unknown as {
  chatReadonlyDb?: PrismaClient;
  chatDbFallbackWarned?: boolean;
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
 * `CHAT_READONLY_DATABASE_URL` está configurada; si no, el cliente normal
 * (con warn una sola vez por proceso).
 */
export function getChatDb(): PrismaClient {
  if (!globalForChatDb.chatReadonlyDb) {
    const client = buildClient();
    if (client) {
      globalForChatDb.chatReadonlyDb = client;
    } else {
      if (!globalForChatDb.chatDbFallbackWarned) {
        globalForChatDb.chatDbFallbackWarned = true;
        log.warn(
          "chat-db",
          "CHAT_READONLY_DATABASE_URL no configurada — execute_sql usa la conexión normal (sin barrera de solo lectura)"
        );
      }
      return prisma;
    }
  }
  return globalForChatDb.chatReadonlyDb;
}
