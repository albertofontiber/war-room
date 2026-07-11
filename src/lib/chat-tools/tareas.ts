import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditLog, diffFields } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import type { TareaTipo } from "@/types";
import type { ChatToolContext } from "./types";

// Tipos válidos de tarea. Sincronizado con `TareaTipo` en types/index.ts.
const TAREA_TIPOS = [
  "contacto_linkedin",
  "mensaje_whatsapp",
  "llamada",
  "videollamada",
  "reunion_presencial",
  "email",
  "otra",
] as const;

export function buildCrearTareaTool({ currentUser }: ChatToolContext) {
  return tool({
    description:
      "Crea una tarea en el CRM ligada a una empresa. Usa SIEMPRE buscar_empresa antes para obtener el empresaId correcto — no inventes IDs. Para el tipo, infiérelo del verbo del usuario según el mapping del system prompt (llamada/videollamada/reunion_presencial/mensaje_whatsapp/contacto_linkedin/email). Si el usuario NO da pista clara del medio, NO crees la tarea con tipo='otra' silenciosamente — pregúntale antes. Si especifica una fecha natural ('mañana', 'el viernes', 'en 3 días'), conviértela a ISO 8601 antes de pasarla. El autor de la tarea es el usuario autenticado (no se pasa explícitamente).",
    inputSchema: z.object({
      empresaId: z
        .number()
        .int()
        .positive()
        .describe("ID numérico de la empresa (obtenido vía buscar_empresa)."),
      titulo: z
        .string()
        .min(1)
        .max(255)
        .describe("Título breve de la tarea. Ej: 'Llamar a Aize Bua'."),
      tipo: z
        .enum(TAREA_TIPOS)
        .optional()
        .describe(
          "Tipo de tarea. Inferir SIEMPRE del verbo del usuario (ver mapping del system prompt). 'otra' SOLO si el usuario lo pide expresamente — para casos ambiguos, preguntar antes de crear, no defaultar."
        ),
      descripcion: z
        .string()
        .optional()
        .describe(
          "Detalles adicionales libres (opcional). Ej: 'Confirmar siguiente reunión y mandar NDA'."
        ),
      fechaLimite: z
        .string()
        .datetime()
        .optional()
        .describe(
          "Fecha límite en ISO 8601 (ej: '2026-05-15T10:00:00.000Z'). Si el usuario dice 'mañana' o 'el viernes', convertirla a ISO antes de pasarla. Opcional."
        ),
      completada: z
        .boolean()
        .optional()
        .describe(
          "Si la tarea es un registro histórico de algo ya hecho, pasar true. Default false (pendiente)."
        ),
      resultado: z
        .string()
        .optional()
        .describe("Solo si completada=true: notas de lo que pasó. Opcional."),
    }),
    execute: async (args: {
      empresaId: number;
      titulo: string;
      tipo?: (typeof TAREA_TIPOS)[number];
      descripcion?: string;
      fechaLimite?: string;
      completada?: boolean;
      resultado?: string;
    }) => {
      try {
        // Verificar que la empresa existe (defensa contra IDs alucinados).
        const empresa = await prisma.empresa.findUnique({
          where: { id: args.empresaId },
          select: { id: true, nombre: true, esAnonima: true },
        });
        if (!empresa || empresa.esAnonima) {
          return {
            error: `Empresa ${args.empresaId} no encontrada. Usa buscar_empresa para obtener un id válido.`,
          };
        }

        const isCompletada = args.completada === true;
        const tarea = await prisma.tarea.create({
          data: {
            empresaId: args.empresaId,
            tipo: (args.tipo ?? "otra") as TareaTipo,
            titulo: args.titulo.slice(0, 255),
            descripcion: args.descripcion?.trim() || null,
            resultado: args.resultado?.trim() || null,
            fechaLimite: args.fechaLimite ? new Date(args.fechaLimite) : null,
            completada: isCompletada,
            completadaAt: isCompletada ? new Date() : null,
            autorId: currentUser.id,
          },
          select: {
            id: true,
            titulo: true,
            tipo: true,
            fechaLimite: true,
            completada: true,
            empresa: { select: { id: true, nombre: true } },
          },
        });

        void auditLog({
          actorType: "admin",
          actorId: currentUser.id,
          action: "create",
          entityType: "tarea",
          entityId: tarea.id,
          after: {
            empresaId: tarea.empresa.id,
            tipo: tarea.tipo,
            titulo: tarea.titulo,
            fechaLimite: tarea.fechaLimite,
            completada: tarea.completada,
            source: "chat-ia",
          },
        });

        return {
          ok: true,
          tarea: {
            id: tarea.id,
            titulo: tarea.titulo,
            tipo: tarea.tipo,
            fechaLimite: tarea.fechaLimite,
            completada: tarea.completada,
            empresa: tarea.empresa,
          },
        };
      } catch (err: unknown) {
        log.error("chat/crear_tarea", err);
        const message =
          err instanceof Error ? err.message : "Error creando tarea";
        return { error: message };
      }
    },
  });
}

export function buildActualizarTareaTool({ currentUser }: ChatToolContext) {
  return tool({
    description:
      'Modifica una tarea existente del CRM. Usa SIEMPRE execute_sql primero para encontrar el `tareaId` correcto (ej: `SELECT id, titulo, tipo, "fechaLimite", completada FROM "Tarea" WHERE "empresaId"=X AND completada=false ORDER BY "createdAt" DESC LIMIT 5`). Solo pasa los campos que cambian — los omitidos quedan igual. Si marcas completada=true, se setea completadaAt automáticamente. Auditado.',
    inputSchema: z.object({
      tareaId: z
        .number()
        .int()
        .positive()
        .describe(
          "ID numérico de la tarea (obtenido vía execute_sql sobre la tabla Tarea)."
        ),
      tipo: z
        .enum(TAREA_TIPOS)
        .optional()
        .describe("Nuevo tipo. Omitir si no se cambia."),
      titulo: z
        .string()
        .min(1)
        .max(255)
        .optional()
        .describe("Nuevo título. Omitir si no se cambia."),
      descripcion: z
        .string()
        .nullable()
        .optional()
        .describe(
          "Nueva descripción. Pasa null para vaciarla, omitir para no tocar."
        ),
      fechaLimite: z
        .string()
        .datetime()
        .nullable()
        .optional()
        .describe(
          "Nueva fecha en ISO 8601, o null para quitarla. Convertir fechas naturales antes."
        ),
      completada: z
        .boolean()
        .optional()
        .describe(
          "true marca como completada (setea completadaAt=now). false la reabre (limpia completadaAt)."
        ),
      resultado: z
        .string()
        .nullable()
        .optional()
        .describe(
          "Notas post-evento. Útil al marcar completada=true para narrar lo que pasó."
        ),
    }),
    execute: async (args: {
      tareaId: number;
      tipo?: (typeof TAREA_TIPOS)[number];
      titulo?: string;
      descripcion?: string | null;
      fechaLimite?: string | null;
      completada?: boolean;
      resultado?: string | null;
    }) => {
      try {
        const prev = await prisma.tarea.findUnique({
          where: { id: args.tareaId },
          select: {
            tipo: true,
            titulo: true,
            descripcion: true,
            resultado: true,
            fechaLimite: true,
            completada: true,
            empresa: { select: { id: true, nombre: true } },
          },
        });
        if (!prev) {
          return {
            error: `Tarea ${args.tareaId} no encontrada. Verifica el id con execute_sql.`,
          };
        }

        const data: Record<string, unknown> = {};
        if (args.tipo !== undefined) data.tipo = args.tipo as TareaTipo;
        if (args.titulo !== undefined) data.titulo = args.titulo.slice(0, 255);
        if (args.descripcion !== undefined)
          data.descripcion = args.descripcion?.trim() || null;
        if (args.resultado !== undefined)
          data.resultado = args.resultado?.trim() || null;
        if (args.fechaLimite !== undefined) {
          data.fechaLimite = args.fechaLimite
            ? new Date(args.fechaLimite)
            : null;
        }
        if (args.completada !== undefined) {
          data.completada = args.completada;
          data.completadaAt = args.completada ? new Date() : null;
        }

        if (Object.keys(data).length === 0) {
          return {
            error:
              "No has pasado ningún campo a modificar. Indica al menos uno.",
          };
        }

        const tarea = await prisma.tarea.update({
          where: { id: args.tareaId },
          data,
          select: {
            id: true,
            tipo: true,
            titulo: true,
            descripcion: true,
            resultado: true,
            fechaLimite: true,
            completada: true,
            empresa: { select: { id: true, nombre: true } },
          },
        });

        const diff = diffFields(
          {
            tipo: prev.tipo,
            titulo: prev.titulo,
            descripcion: prev.descripcion,
            resultado: prev.resultado,
            fechaLimite: prev.fechaLimite,
            completada: prev.completada,
          },
          {
            tipo: tarea.tipo,
            titulo: tarea.titulo,
            descripcion: tarea.descripcion,
            resultado: tarea.resultado,
            fechaLimite: tarea.fechaLimite,
            completada: tarea.completada,
          }
        );
        if (Object.keys(diff.after).length > 0) {
          void auditLog({
            actorType: "admin",
            actorId: currentUser.id,
            action: "update",
            entityType: "tarea",
            entityId: tarea.id,
            before: diff.before,
            after: { ...diff.after, source: "chat-ia" },
          });
        }

        return {
          ok: true,
          tarea: {
            id: tarea.id,
            titulo: tarea.titulo,
            tipo: tarea.tipo,
            fechaLimite: tarea.fechaLimite,
            completada: tarea.completada,
            empresa: tarea.empresa,
          },
          changes: Object.keys(diff.after),
        };
      } catch (err: unknown) {
        log.error("chat/actualizar_tarea", err);
        const message =
          err instanceof Error ? err.message : "Error actualizando tarea";
        return { error: message };
      }
    },
  });
}
