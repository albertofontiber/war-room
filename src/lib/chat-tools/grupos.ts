import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extractAdquirente } from "@/lib/borme-adquirente";
import { clasificarMovimientos } from "@/lib/grupo-movimientos";
import { aliasDeGrupo, grupoPorAlias } from "@/lib/borme-senales";

/**
 * movimientos_grupo — qué empresas ha incorporado un grupo en un periodo.
 * La lógica de clasificación vive en `src/lib/grupo-movimientos.ts`.
 */
export function buildMovimientosGrupoTool() {
  return tool({
    description:
      "Empresas que un grupo consolidador (Attlon, Grupo Fire, Scutum…) ha incorporado en un periodo, reconstruido desde el BORME: fecha de entrada por empresa, actos (adquisición, fusión, cambio de denominación) y adquirente. Úsalo para '¿cuántas empresas ha comprado X en los últimos 6 meses?', '¿qué ha incluido Attlon este año?', '¿qué movimientos ha tenido Grupo Fire?'. Si el nombre no es un grupo registrado, devuelve igualmente los actos de adquisición/fusión cuyo texto lo menciona (socio único, sociedad absorbente).",
    inputSchema: z.object({
      grupo: z
        .string()
        .min(2)
        .describe("Nombre (o parte) del grupo o del comprador. Ej: 'attlon', 'grupo fire', 'vesta'."),
      desde: z
        .string()
        .optional()
        .describe("ISO 8601, inicio del periodo (incluido). Omitir = todo el histórico (BORME desde abril 2024)."),
      hasta: z.string().optional().describe("ISO 8601, fin del periodo. Default: ahora."),
    }),
    execute: async ({ grupo, desde, hasta }: { grupo: string; desde?: string; hasta?: string }) => {
      try {
        const desdeDate = desde ? new Date(desde) : null;
        const hastaDate = hasta ? new Date(hasta) : new Date();
        if ((desdeDate && isNaN(desdeDate.getTime())) || isNaN(hastaDate.getTime())) {
          return { error: "Fecha inválida: usa ISO 8601 (YYYY-MM-DD)." };
        }
        const periodo = {
          desde: desdeDate ? desdeDate.toISOString().slice(0, 10) : "inicio del histórico (abril 2024)",
          hasta: hastaDate.toISOString().slice(0, 10),
        };

        // "atlon" → "Attlon": las grafías alternativas resuelven al grupo real.
        const nombreBuscado = grupoPorAlias(grupo) ?? grupo;
        const candidatos = await prisma.grupo.findMany({
          where: { nombre: { contains: nombreBuscado, mode: "insensitive" } },
          select: { id: true, nombre: true, tipo: true, notas: true },
        });
        const exacto = candidatos.find((g) => g.nombre.toLowerCase() === nombreBuscado.toLowerCase());
        if (!exacto && candidatos.length > 1) {
          return {
            ambiguo: true,
            mensaje: "Varios grupos coinciden; pregunta al usuario cuál.",
            candidatos,
          };
        }
        const g = exacto ?? candidatos[0] ?? null;

        let resultado: ReturnType<typeof clasificarMovimientos> | null = null;
        let miembrosActuales = 0;
        const idsCubiertos = new Set<number>();

        if (g) {
          const [alertas, miembros] = await Promise.all([
            prisma.bormeAlerta.findMany({
              where: { OR: [{ grupoInferidoId: g.id }, { empresa: { grupoId: g.id } }] },
              select: {
                id: true,
                empresaId: true,
                fecha: true,
                tipoActo: true,
                descripcion: true,
                grupoInferidoId: true,
                empresa: { select: { nombre: true, grupoId: true } },
              },
            }),
            prisma.empresa.findMany({
              where: { grupoId: g.id },
              select: { id: true, nombre: true },
              orderBy: { nombre: "asc" },
            }),
          ]);
          miembrosActuales = miembros.length;
          alertas.forEach((a) => idsCubiertos.add(a.id));
          resultado = clasificarMovimientos({
            grupoId: g.id,
            alertas: alertas.map((a) => ({
              id: a.id,
              empresaId: a.empresaId,
              empresaNombre: a.empresa.nombre,
              empresaGrupoId: a.empresa.grupoId,
              fecha: a.fecha,
              tipoActo: a.tipoActo,
              descripcion: a.descripcion,
              grupoInferidoId: a.grupoInferidoId,
            })),
            miembros,
            desde: desdeDate,
            hasta: hastaDate,
          });
        }

        // Compradores que no son un Grupo registrado (o vehículos del grupo
        // con otro nombre): actos de adquisición/fusión que los mencionan.
        // Se busca por lo que escribió el usuario, el nombre del grupo y sus
        // alias (el BORME a veces escribe "ATLON" por "ATTLON").
        const terminos = [...new Set([grupo, ...(g ? [g.nombre, ...aliasDeGrupo(g.nombre)] : [])])];
        const menciones = await prisma.bormeAlerta.findMany({
          where: {
            tipoActo: { in: ["adquisicion", "fusion"] },
            OR: terminos.map((t) => ({ descripcion: { contains: t, mode: "insensitive" as const } })),
            fecha: { ...(desdeDate ? { gte: desdeDate } : {}), lte: hastaDate },
          },
          orderBy: { fecha: "asc" },
          take: 30,
          select: {
            id: true,
            fecha: true,
            tipoActo: true,
            descripcion: true,
            empresa: { select: { id: true, nombre: true } },
          },
        });
        const mencionesNuevas = menciones
          .filter((m) => !idsCubiertos.has(m.id))
          .map((m) => ({
            empresaId: m.empresa.id,
            empresa: m.empresa.nombre,
            fecha: m.fecha.toISOString().slice(0, 10),
            tipoActo: m.tipoActo,
            adquirente: extractAdquirente(m.descripcion),
            resumen: (m.descripcion ?? "").replace(/\s+/g, " ").slice(0, 220),
          }));

        return {
          grupo: g,
          ...(g
            ? {}
            : {
                aviso: `"${grupo}" no es un grupo registrado en la tabla Grupo. Solo se devuelven actos BORME cuyo texto lo menciona.`,
              }),
          periodo,
          totales: resultado
            ? {
                miembrosActuales,
                entradasEnPeriodo: resultado.entradas.length,
                entradasDudosas: resultado.entradas.filter((e) => !e.enGrupoActualmente).length,
              }
            : null,
          ...(resultado ?? {}),
          mencionesEnActosDeCompra: mencionesNuevas,
          metodo:
            "Si grupo.notas trae contexto (vehículos del grupo, empresas del mismo fondo que NO son del grupo), úsalo al interpretar. fechaEntrada = primera alerta BORME que vincula la empresa al grupo, o la adquisición/fusión que la precede en menos de 90 días (no hay campo 'fecha de entrada' en la ficha). enGrupoActualmente=false = el BORME la vincula pero la ficha no la tiene asignada al grupo: posible falso positivo, dilo. miembrosSinSenal = miembros con fecha de entrada desconocida.",
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown";
        return { error: message };
      }
    },
  });
}
