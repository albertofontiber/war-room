import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEAL_STAGES } from "@/lib/crm";
import { cambiarEtapa } from "@/lib/crm-stage";
import { log } from "@/lib/logger";
import type { DealStage } from "@/types";
import type { ChatToolContext } from "./types";

export function buildCambiarEtapaTool({ currentUser }: ChatToolContext) {
  return tool({
    description:
      "Cambia la etapa (dealStage) de una empresa en el funnel CRM y registra la transición en CrmLog con autoría. Usa SIEMPRE buscar_empresa antes para obtener el empresaId correcto (su respuesta incluye el dealStage actual) — no inventes IDs. Mapea el lenguaje del usuario a la etapa según el system prompt ('1ª reunión' → primera_reunion, 'LOI' → 'LOI enviada', 'pausa' → on_hold, 'descartada' → muerto). NO puede sacar una empresa del funnel (eso se hace desde la UI). Al entrar a primera_reunion se auto-crean carpeta OneDrive + página Notion (side-effect estándar del CRM).",
    inputSchema: z.object({
      empresaId: z
        .number()
        .int()
        .positive()
        .describe("ID numérico de la empresa (obtenido vía buscar_empresa)."),
      dealStage: z
        .enum(DEAL_STAGES as [string, ...string[]])
        .describe(
          "Etapa destino. Valores: identificado, contactado, primera_reunion, analisis, 'LOI enviada', execution, portfolio, on_hold, muerto."
        ),
      note: z
        .string()
        .max(500)
        .optional()
        .describe(
          "Comentario opcional para el log del CRM — ej. el motivo que mencione el usuario ('acordado en la llamada de hoy')."
        ),
    }),
    execute: async (args: {
      empresaId: number;
      dealStage: string;
      note?: string;
    }) => {
      try {
        // Verificar que la empresa existe y no es un lead anónimo
        // (defensa contra IDs alucinados, mismo patrón que crear_tarea).
        const empresa = await prisma.empresa.findUnique({
          where: { id: args.empresaId },
          select: { id: true, nombre: true, esAnonima: true },
        });
        if (!empresa || empresa.esAnonima) {
          return {
            error: `Empresa ${args.empresaId} no encontrada. Usa buscar_empresa para obtener un id válido.`,
          };
        }

        const result = await cambiarEtapa({
          empresaId: args.empresaId,
          dealStage: args.dealStage as DealStage,
          note: args.note?.trim() || null,
          autorId: currentUser.id,
        });
        if (!result.ok) {
          return {
            error: `Empresa ${args.empresaId} no encontrada. Usa buscar_empresa para obtener un id válido.`,
          };
        }

        return {
          ok: true,
          empresa: { id: empresa.id, nombre: empresa.nombre },
          fromStage: result.fromStage,
          dealStage: result.dealStage,
          changed: result.changed,
          ...(result.changed
            ? {}
            : {
                aviso:
                  "La empresa ya estaba en esa etapa — no se registró ninguna transición.",
              }),
        };
      } catch (err: unknown) {
        log.error("chat/cambiar_etapa", err);
        const message =
          err instanceof Error ? err.message : "Error cambiando etapa";
        return { error: message };
      }
    },
  });
}
