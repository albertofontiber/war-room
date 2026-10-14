import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export function buildBuscarEmpresaTool() {
  return tool({
    description:
      "Busca empresas por nombre legal, nombre comercial o CIF (búsqueda parcial case-insensitive). Útil ANTES de crear_tarea para encontrar el empresaId correcto sin alucinar. Devuelve hasta 10 matches con datos básicos (id, nombre, nombreComercial, cif, provincia, sector, grupo, dealStage).",
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .describe(
          "Texto a buscar en el nombre legal, el nombre comercial o el CIF. Búsqueda ILIKE %query%. Ej: 'aize', 'tesein', 'fireprotect', 'B12345678'."
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
      const cifQuery = query.replace(/[\s.-]/g, "");
      try {
        const empresas = await prisma.empresa.findMany({
          where: {
            esAnonima: false,
            OR: [
              { nombre: { contains: query, mode: "insensitive" } },
              { nombreComercial: { contains: query, mode: "insensitive" } },
              // El CIF se guarda sin espacios ni guiones: normalizamos la query.
              ...(cifQuery.length >= 3
                ? [{ cif: { contains: cifQuery, mode: "insensitive" as const } }]
                : []),
            ],
          },
          take: limit ?? 10,
          orderBy: { nombre: "asc" },
          select: {
            id: true,
            nombre: true,
            nombreComercial: true,
            cif: true,
            provincia: true,
            sector: true,
            enPerimetro: true,
            grupo: { select: { nombre: true } },
            crmEstado: { select: { dealStage: true } },
          },
        });
        return {
          count: empresas.length,
          results: empresas.map((e) => ({
            id: e.id,
            nombre: e.nombre,
            nombreComercial: e.nombreComercial,
            cif: e.cif,
            provincia: e.provincia,
            sector: e.sector,
            enPerimetro: e.enPerimetro,
            grupo: e.grupo?.nombre ?? null,
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
