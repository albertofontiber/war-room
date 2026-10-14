import { tool } from "ai";
import { z } from "zod";
import { getChatDb } from "@/lib/chat-db";
import { addLimit, DEFAULT_LIMIT, validateSQL } from "@/lib/chat-sql-guard";

/**
 * SELECT read-only contra la BD. Dos capas: el guard de texto
 * (`chat-sql-guard.ts`) y la conexión con rol de solo lectura (`chat-db.ts`).
 */
export function buildExecuteSqlTool() {
  return tool({
    description:
      "Ejecuta una query SQL de lectura (SELECT o WITH … SELECT) contra la base de datos PostgreSQL del War Room. Una sola sentencia. Para contar, usa COUNT(*) en SQL — no cuentes filas devueltas: sin LIMIT explícito se cortan a 100.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Query SQL SELECT a ejecutar. Usa comillas dobles para nombres de tablas/columnas con mayúsculas."
        ),
    }),
    execute: async ({ query }: { query: string }) => {
      if (!validateSQL(query)) {
        return {
          error:
            "Query rechazada: solo una sentencia de lectura (SELECT o WITH … SELECT), sin escrituras ni columnas de credenciales.",
        };
      }
      const safeQuery = addLimit(query);
      try {
        const rawRows = await getChatDb().$queryRawUnsafe(safeQuery);
        // Convert BigInt values to Number (Prisma returns BigInt for COUNT, SUM, etc.)
        const rows = JSON.parse(
          JSON.stringify(rawRows, (_key, value) =>
            typeof value === "bigint" ? Number(value) : value
          )
        );
        const count = Array.isArray(rows) ? rows.length : 0;
        return {
          query: safeQuery,
          rows,
          count,
          // Aviso para que el modelo no presente un listado cortado como total.
          ...(!/\bLIMIT\b/i.test(query) && count === DEFAULT_LIMIT
            ? {
                truncated: true,
                aviso: `Resultado cortado a ${DEFAULT_LIMIT} filas. Para totales usa COUNT(*).`,
              }
            : {}),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { error: message, query: safeQuery };
      }
    },
  });
}
