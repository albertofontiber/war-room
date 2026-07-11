import { tool } from "ai";
import { z } from "zod";
import {
  listFinderActivity,
  summarizeFinderActivity,
} from "@/lib/finder-activity";
import { log } from "@/lib/logger";

// Actions reconocidas en `FinderAccessLog`. Sincronizado con `FinderAction`
// en `src/lib/finder-access-log.ts`. Expuesto al schema del tool para que el
// modelo no pueda inventar valores.
const FINDER_ACTIONS = [
  "login_success",
  "login_failure",
  "view_deals",
  "view_deal",
  "add_note",
  "edit_note",
  "delete_note",
  "add_task",
  "edit_task",
  "complete_task",
  "delete_task",
  "propose_target",
  "propose_target_duplicate",
] as const;

export function buildActividadFindersTool() {
  return tool({
    description:
      "Lista la actividad reciente de los finders en el portal (vistas de Kanban, vistas de ficha, creación/edición/borrado de notas y tareas, completar tareas, propuestas de targets, intentos de login). Filtros opcionales por finder (nombre parcial), acción y rango temporal. Por defecto últimas 24h, máx 200 entradas. Si el usuario pregunta '¿qué hizo X?', '¿qué finders están activos?', '¿quién entró ayer?', etc., usa este tool en vez de execute_sql.",
    inputSchema: z.object({
      finderName: z
        .string()
        .optional()
        .describe(
          "Filtro por nombre del finder (búsqueda parcial ILIKE %nombre%). Omitir para todos."
        ),
      action: z
        .enum(FINDER_ACTIONS)
        .optional()
        .describe("Filtrar por una acción concreta. Omitir para todas las acciones."),
      desde: z
        .string()
        .datetime()
        .optional()
        .describe("Inicio del rango en ISO 8601. Si se omite, últimas 24h (now - 24h)."),
      hasta: z
        .string()
        .datetime()
        .optional()
        .describe("Fin del rango en ISO 8601. Si se omite, ahora."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Máximo de filas (default 50, max 200)."),
    }),
    execute: async (args: {
      finderName?: string;
      action?: (typeof FINDER_ACTIONS)[number];
      desde?: string;
      hasta?: string;
      limit?: number;
    }) => {
      try {
        const desde = args.desde
          ? new Date(args.desde)
          : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const hasta = args.hasta ? new Date(args.hasta) : new Date();
        const { rows, count } = await listFinderActivity({
          finderName: args.finderName,
          action: args.action,
          desde,
          hasta,
          limit: args.limit,
        });
        return {
          rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
          count,
          rows,
        };
      } catch (err: unknown) {
        log.error("chat/actividad_finders", err);
        return {
          error:
            err instanceof Error ? err.message : "Error consultando actividad",
        };
      }
    },
  });
}

export function buildResumenActividadFindersTool() {
  return tool({
    description:
      "Agrega counts de acciones del portal en un rango temporal. Sirve para ranking de finders más activos, distribución de tipos de acción, o tendencia día a día. Cuando el usuario pregunta '¿qué finder está más activo?', '¿cuántas tareas crearon esta semana?', '¿cómo ha sido la actividad por día?', etc., usa este tool y no execute_sql.",
    inputSchema: z.object({
      desde: z
        .string()
        .datetime()
        .optional()
        .describe("Inicio del rango en ISO 8601. Si se omite, hace 7 días."),
      hasta: z
        .string()
        .datetime()
        .optional()
        .describe("Fin del rango en ISO 8601. Si se omite, ahora."),
      agruparPor: z
        .enum(["finder", "accion", "dia", "finder_accion"])
        .describe(
          "Cómo agrupar: 'finder' = ranking por finder, 'accion' = ranking por tipo de acción, 'dia' = serie diaria (Europe/Madrid), 'finder_accion' = matriz finder×acción."
        ),
    }),
    execute: async (args: {
      desde?: string;
      hasta?: string;
      agruparPor: "finder" | "accion" | "dia" | "finder_accion";
    }) => {
      try {
        const desde = args.desde
          ? new Date(args.desde)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const hasta = args.hasta ? new Date(args.hasta) : new Date();
        const { rows } = await summarizeFinderActivity({
          desde,
          hasta,
          groupBy: args.agruparPor,
        });
        return {
          rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
          agruparPor: args.agruparPor,
          rows,
        };
      } catch (err: unknown) {
        log.error("chat/resumen_actividad_finders", err);
        return {
          error:
            err instanceof Error ? err.message : "Error agregando actividad",
        };
      }
    },
  });
}
