import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export function buildBuscarEmpresaTool() {
  return tool({
    description:
      "Busca empresas por nombre (búsqueda parcial case-insensitive). Útil ANTES de crear_tarea para encontrar el empresaId correcto sin alucinar. Devuelve hasta 10 matches con datos básicos (id, nombre, provincia, sector, dealStage).",
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .describe(
          "Texto a buscar en el nombre de la empresa. Búsqueda ILIKE %query%. Ej: 'aize', 'tesein', 'fire'."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Máximo de resultados (default 10)."),
    }),
    execute: async ({ query, limit }: { query: string; limit?: number }) => {
      try {
        const empresas = await prisma.empresa.findMany({
          where: {
            esAnonima: false,
            nombre: { contains: query, mode: "insensitive" },
          },
          take: limit ?? 10,
          orderBy: { nombre: "asc" },
          select: {
            id: true,
            nombre: true,
            provincia: true,
            sector: true,
            enPerimetro: true,
            crmEstado: { select: { dealStage: true } },
          },
        });
        return {
          count: empresas.length,
          results: empresas.map((e) => ({
            id: e.id,
            nombre: e.nombre,
            provincia: e.provincia,
            sector: e.sector,
            enPerimetro: e.enPerimetro,
            dealStage: e.crmEstado?.dealStage ?? null,
          })),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown";
        return { error: message };
      }
    },
  });
}
