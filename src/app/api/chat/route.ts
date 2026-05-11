import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SYSTEM_PROMPT } from "@/lib/chat-schema";
import { getCurrentUser } from "@/lib/user-from-session";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import type { TareaTipo } from "@/types";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

function validateSQL(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+$/, "").trim();
  if (!trimmed.toUpperCase().startsWith("SELECT")) return false;
  if (FORBIDDEN.test(trimmed)) return false;
  return true;
}

function addLimit(sql: string): string {
  const trimmed = sql.trim().replace(/;+$/, "");
  if (!/\bLIMIT\b/i.test(trimmed)) {
    return trimmed + " LIMIT 100";
  }
  return trimmed;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  // Solo admins. El chat ejecuta SELECT arbitrario sobre toda la BD vía
  // prisma.$queryRawUnsafe — un finder con sesión activa no debe poder leer
  // CIFs, financieros, password hashes, etc.
  if (!session || session.kind !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  // El user.id se necesita para `autorId` al crear tareas. Lo capturamos
  // una sola vez por request — el closure de los tools lo usa después.
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  // Strip 'id' field — convertToModelMessages expects Omit<UIMessage, 'id'>
  const messagesWithoutId = (body.messages || []).map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ id, ...rest }: { id: string; [key: string]: unknown }) => rest
  );
  const modelMessages = await convertToModelMessages(messagesWithoutId);

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    // Bumpeado a 8 porque ahora puede encadenar buscar_empresa → crear_tarea
    // → execute_sql (verificar) en un solo turno.
    stopWhen: stepCountIs(8),
    tools: {
      execute_sql: tool({
        description:
          "Ejecuta una query SQL SELECT contra la base de datos PostgreSQL del War Room. Solo SELECT permitido.",
        inputSchema: z.object({
          query: z
            .string()
            .describe("Query SQL SELECT a ejecutar. Usa comillas dobles para nombres de tablas/columnas con mayúsculas."),
        }),
        execute: async ({ query }: { query: string }) => {
          if (!validateSQL(query)) {
            return { error: "Solo se permiten queries SELECT." };
          }
          const safeQuery = addLimit(query);
          try {
            const rawRows = await prisma.$queryRawUnsafe(safeQuery);
            // Convert BigInt values to Number (Prisma returns BigInt for COUNT, SUM, etc.)
            const rows = JSON.parse(JSON.stringify(rawRows, (_key, value) =>
              typeof value === "bigint" ? Number(value) : value
            ));
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
      }),

      buscar_empresa: tool({
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
        execute: async ({
          query,
          limit,
        }: {
          query: string;
          limit?: number;
        }) => {
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
      }),

      crear_tarea: tool({
        description:
          "Crea una tarea en el CRM ligada a una empresa. Usa SIEMPRE buscar_empresa antes para obtener el empresaId correcto — no inventes IDs. Si el usuario no especifica tipo, déjalo como 'otra'. Si especifica una fecha natural ('mañana', 'el viernes', 'en 3 días'), conviértela a ISO 8601 antes de pasarla. El autor de la tarea es el usuario autenticado (no se pasa explícitamente).",
        inputSchema: z.object({
          empresaId: z
            .number()
            .int()
            .positive()
            .describe(
              "ID numérico de la empresa (obtenido vía buscar_empresa)."
            ),
          titulo: z
            .string()
            .min(1)
            .max(255)
            .describe("Título breve de la tarea. Ej: 'Llamar a Aize Bua'."),
          tipo: z
            .enum(TAREA_TIPOS)
            .optional()
            .describe(
              "Tipo de tarea. Si no se sabe, omitir → default 'otra'."
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
            .describe(
              "Solo si completada=true: notas de lo que pasó. Opcional."
            ),
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
                fechaLimite: args.fechaLimite
                  ? new Date(args.fechaLimite)
                  : null,
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
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
