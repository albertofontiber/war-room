import { tool } from "ai";
import { z } from "zod";
import { getChatDb } from "@/lib/chat-db";
import { addLimit, validateSQL } from "@/lib/chat-sql-guard";

/**
 * SELECT read-only contra la BD. Dos capas: el guard de texto
 * (`chat-sql-guard.ts`) y la conexión con rol de solo lectura (`chat-db.ts`).
 */
export function buildExecuteSqlTool() {
  return tool({
    description:
      "Ejecuta una query SQL SELECT contra la base de datos PostgreSQL del War Room. Solo SELECT permitido.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Query SQL SELECT a ejecutar. Usa comillas dobles para nombres de tablas/columnas con mayúsculas."
        ),
    }),
    execute: async ({ query }: { query: string }) => {
      if (!validateSQL(query)) {
        return { error: "Solo se permiten queries SELECT." };
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
        return {
          query: safeQuery,
          rows,
          count: Array.isArray(rows) ? rows.length : 0,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { error: message, query: safeQuery };
      }
    },
  });
}
