import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SYSTEM_PROMPT } from "@/lib/chat-schema";
import { getCurrentUser } from "@/lib/user-from-session";
import { auditLog, diffFields } from "@/lib/audit-log";
import {
  listFinderActivity,
  summarizeFinderActivity,
} from "@/lib/finder-activity";
import { log } from "@/lib/logger";
import type { TareaTipo } from "@/types";
import { z } from "zod";

export const dynamic = "force-dynamic";
// 60s: con 16 pasos de tools posibles, 30s cortaba a medias las cadenas
// largas (buscar → varias queries → crear → verificar).
export const maxDuration = 60;

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
    model: anthropic("claude-sonnet-5"),
    // El system prompt va como mensajes de sistema (no como `system:`) para
    // poder partirlo en dos bloques:
    // 1. SYSTEM_PROMPT (~5k tokens, estático) con cache de Anthropic — los
    //    turnos siguientes lo leen a ~10% del coste y con menos latencia.
    //    OJO: el bloque cacheado debe ser byte-idéntico entre requests; nada
    //    dinámico (fechas, ids) puede entrar en él o se invalida el cache.
    // 2. La fecha actual, por request y FUERA del bloque cacheado. Antes vivía
    //    interpolada en SYSTEM_PROMPT y se evaluaba al cargar el módulo: en
    //    lambdas calientes el modelo creía que "hoy" era la fecha del cold
    //    start y convertía mal "mañana"/"el viernes" al crear tareas.
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      {
        role: "system",
        content: `Fecha y hora actuales: ${new Date().toISOString()} (el usuario está en Europe/Madrid).`,
      },
      ...modelMessages,
    ],
    // 16 pasos: con 8, las cadenas largas (buscar_empresa → varias queries →
    // crear/actualizar → verificar) se quedaban a medias y el agente "se rendía".
    stopWhen: stepCountIs(16),
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
          "Crea una tarea en el CRM ligada a una empresa. Usa SIEMPRE buscar_empresa antes para obtener el empresaId correcto — no inventes IDs. Para el tipo, infiérelo del verbo del usuario según el mapping del system prompt (llamada/videollamada/reunion_presencial/mensaje_whatsapp/contacto_linkedin/email). Si el usuario NO da pista clara del medio, NO crees la tarea con tipo='otra' silenciosamente — pregúntale antes. Si especifica una fecha natural ('mañana', 'el viernes', 'en 3 días'), conviértela a ISO 8601 antes de pasarla. El autor de la tarea es el usuario autenticado (no se pasa explícitamente).",
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

      actualizar_tarea: tool({
        description:
          "Modifica una tarea existente del CRM. Usa SIEMPRE execute_sql primero para encontrar el `tareaId` correcto (ej: `SELECT id, titulo, tipo, \"fechaLimite\", completada FROM \"Tarea\" WHERE \"empresaId\"=X AND completada=false ORDER BY \"createdAt\" DESC LIMIT 5`). Solo pasa los campos que cambian — los omitidos quedan igual. Si marcas completada=true, se setea completadaAt automáticamente. Auditado.",
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
            if (args.titulo !== undefined)
              data.titulo = args.titulo.slice(0, 255);
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
      }),

      buscar_contacto: tool({
        description:
          "Busca contactos (personas) por nombre o email — parcial, case-insensitive — opcionalmente dentro de una empresa. Úsalo para '¿tenemos el contacto de X?', para obtener el contactoId antes de actualizar_contacto, y para comprobar si alguien ya existe antes de crear_contacto. Devuelve id, nombre, cargo, email, telefono y la empresa.",
        inputSchema: z.object({
          query: z
            .string()
            .min(2)
            .describe(
              "Texto a buscar en nombre o email del contacto. ILIKE %query%. Ej: 'gustavo', 'j.herrero@'."
            ),
          empresaId: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              "Limita la búsqueda a una empresa (obtenida vía buscar_empresa). Omitir para buscar en todas."
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
          empresaId,
          limit,
        }: {
          query: string;
          empresaId?: number;
          limit?: number;
        }) => {
          try {
            const contactos = await prisma.contacto.findMany({
              where: {
                ...(empresaId ? { empresaId } : {}),
                empresa: { esAnonima: false },
                OR: [
                  { nombre: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                ],
              },
              take: limit ?? 10,
              orderBy: { nombre: "asc" },
              select: {
                id: true,
                nombre: true,
                cargo: true,
                email: true,
                telefono: true,
                empresa: { select: { id: true, nombre: true } },
              },
            });
            return { count: contactos.length, results: contactos };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown";
            return { error: message };
          }
        },
      }),

      crear_contacto: tool({
        description:
          "Crea un contacto (persona) ligado a una empresa: nombre + opcionalmente cargo, email, teléfono, notas. Usa SIEMPRE buscar_empresa antes para el empresaId, y buscar_contacto para no duplicar. El email alimenta el matcher del buzón compartido (warroom@fontiber.com): los correos con esa persona se registran solos en el Timeline. Auditado.",
        inputSchema: z.object({
          empresaId: z
            .number()
            .int()
            .positive()
            .describe("ID de la empresa (obtenido vía buscar_empresa)."),
          nombre: z
            .string()
            .min(1)
            .max(255)
            .describe("Nombre completo de la persona. Ej: 'Gustavo Adolfo Martín'."),
          cargo: z
            .string()
            .max(255)
            .optional()
            .describe("Cargo / rol. Ej: 'Director General', 'Responsable de compras'. Opcional."),
          email: z
            .string()
            .max(320)
            .optional()
            .describe("Email del contacto. Opcional pero recomendado — es lo que alimenta el matcher del buzón."),
          telefono: z.string().max(64).optional().describe("Teléfono. Opcional."),
          notas: z.string().optional().describe("Notas libres. Opcional."),
        }),
        execute: async (args: {
          empresaId: number;
          nombre: string;
          cargo?: string;
          email?: string;
          telefono?: string;
          notas?: string;
        }) => {
          try {
            const empresa = await prisma.empresa.findUnique({
              where: { id: args.empresaId },
              select: { id: true, nombre: true, esAnonima: true },
            });
            if (!empresa || empresa.esAnonima) {
              return {
                error: `Empresa ${args.empresaId} no encontrada. Usa buscar_empresa para obtener un id válido.`,
              };
            }
            const nombre = args.nombre.trim();
            const email = args.email?.trim().toLowerCase() || null;
            // Evitar duplicados: mismo nombre o email en esa empresa.
            const orClauses: Array<Record<string, unknown>> = [
              { nombre: { equals: nombre, mode: "insensitive" } },
            ];
            if (email) {
              orClauses.push({ email: { equals: email, mode: "insensitive" } });
            }
            const dupe = await prisma.contacto.findFirst({
              where: { empresaId: args.empresaId, OR: orClauses },
              select: { id: true, nombre: true, email: true },
            });
            if (dupe) {
              return {
                error: `Ya existe un contacto similar en esa empresa (id=${dupe.id}: "${dupe.nombre}" / ${dupe.email ?? "—"}). Usa actualizar_contacto si quieres modificarlo.`,
                existing: dupe,
              };
            }
            const contacto = await prisma.contacto.create({
              data: {
                empresaId: args.empresaId,
                nombre,
                cargo: args.cargo?.trim() || null,
                email,
                telefono: args.telefono?.trim() || null,
                notas: args.notas?.trim() || null,
              },
              select: {
                id: true,
                nombre: true,
                cargo: true,
                email: true,
                telefono: true,
                empresa: { select: { id: true, nombre: true } },
              },
            });

            void auditLog({
              actorType: "admin",
              actorId: currentUser.id,
              action: "create",
              entityType: "contacto",
              entityId: contacto.id,
              after: {
                empresaId: contacto.empresa.id,
                nombre: contacto.nombre,
                cargo: contacto.cargo,
                email: contacto.email,
                telefono: contacto.telefono,
                source: "chat-ia",
              },
            });

            return { ok: true, contacto };
          } catch (err: unknown) {
            log.error("chat/crear_contacto", err);
            const message =
              err instanceof Error ? err.message : "Error creando contacto";
            return { error: message };
          }
        },
      }),

      actualizar_contacto: tool({
        description:
          "Modifica un contacto existente: cualquiera de nombre, cargo, email, teléfono, notas. Usa SIEMPRE buscar_contacto antes para el contactoId. Solo pasa los campos que cambian (null para vaciar uno). Útil para 'añade/cambia el email de X' o 'corrige el cargo de Y'. Auditado.",
        inputSchema: z.object({
          contactoId: z
            .number()
            .int()
            .positive()
            .describe("ID del contacto (obtenido vía buscar_contacto)."),
          nombre: z.string().min(1).max(255).optional().describe("Nuevo nombre. Omitir si no cambia."),
          cargo: z
            .string()
            .max(255)
            .nullable()
            .optional()
            .describe("Nuevo cargo, o null para vaciarlo. Omitir si no cambia."),
          email: z
            .string()
            .max(320)
            .nullable()
            .optional()
            .describe("Nuevo email, o null para vaciarlo. Omitir si no cambia."),
          telefono: z
            .string()
            .max(64)
            .nullable()
            .optional()
            .describe("Nuevo teléfono, o null para vaciarlo. Omitir si no cambia."),
          notas: z
            .string()
            .nullable()
            .optional()
            .describe("Nuevas notas, o null para vaciarlas. Omitir si no cambia."),
        }),
        execute: async (args: {
          contactoId: number;
          nombre?: string;
          cargo?: string | null;
          email?: string | null;
          telefono?: string | null;
          notas?: string | null;
        }) => {
          try {
            const prev = await prisma.contacto.findUnique({
              where: { id: args.contactoId },
              select: {
                nombre: true,
                cargo: true,
                email: true,
                telefono: true,
                notas: true,
                empresa: { select: { id: true, nombre: true } },
              },
            });
            if (!prev) {
              return {
                error: `Contacto ${args.contactoId} no encontrado. Verifica el id con buscar_contacto.`,
              };
            }

            const data: Record<string, unknown> = {};
            if (args.nombre !== undefined) data.nombre = args.nombre.trim();
            if (args.cargo !== undefined) data.cargo = args.cargo?.trim() || null;
            if (args.email !== undefined)
              data.email = args.email?.trim().toLowerCase() || null;
            if (args.telefono !== undefined)
              data.telefono = args.telefono?.trim() || null;
            if (args.notas !== undefined) data.notas = args.notas?.trim() || null;

            if (Object.keys(data).length === 0) {
              return {
                error: "No has pasado ningún campo a modificar. Indica al menos uno.",
              };
            }

            const updated = await prisma.contacto.update({
              where: { id: args.contactoId },
              data,
              select: {
                id: true,
                nombre: true,
                cargo: true,
                email: true,
                telefono: true,
                notas: true,
                empresa: { select: { id: true, nombre: true } },
              },
            });

            const diff = diffFields(
              {
                nombre: prev.nombre,
                cargo: prev.cargo,
                email: prev.email,
                telefono: prev.telefono,
                notas: prev.notas,
              },
              {
                nombre: updated.nombre,
                cargo: updated.cargo,
                email: updated.email,
                telefono: updated.telefono,
                notas: updated.notas,
              }
            );
            if (Object.keys(diff.after).length > 0) {
              void auditLog({
                actorType: "admin",
                actorId: currentUser.id,
                action: "update",
                entityType: "contacto",
                entityId: updated.id,
                before: diff.before,
                after: { ...diff.after, source: "chat-ia" },
              });
            }

            return {
              ok: true,
              contacto: {
                id: updated.id,
                nombre: updated.nombre,
                cargo: updated.cargo,
                email: updated.email,
                telefono: updated.telefono,
                empresa: updated.empresa,
              },
              changes: Object.keys(diff.after),
            };
          } catch (err: unknown) {
            log.error("chat/actualizar_contacto", err);
            const message =
              err instanceof Error ? err.message : "Error actualizando contacto";
            return { error: message };
          }
        },
      }),

      actividad_finders: tool({
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
            .describe(
              "Filtrar por una acción concreta. Omitir para todas las acciones."
            ),
          desde: z
            .string()
            .datetime()
            .optional()
            .describe(
              "Inicio del rango en ISO 8601. Si se omite, últimas 24h (now - 24h)."
            ),
          hasta: z
            .string()
            .datetime()
            .optional()
            .describe(
              "Fin del rango en ISO 8601. Si se omite, ahora."
            ),
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
      }),

      resumen_actividad_finders: tool({
        description:
          "Agrega counts de acciones del portal en un rango temporal. Sirve para ranking de finders más activos, distribución de tipos de acción, o tendencia día a día. Cuando el usuario pregunta '¿qué finder está más activo?', '¿cuántas tareas crearon esta semana?', '¿cómo ha sido la actividad por día?', etc., usa este tool y no execute_sql.",
        inputSchema: z.object({
          desde: z
            .string()
            .datetime()
            .optional()
            .describe(
              "Inicio del rango en ISO 8601. Si se omite, hace 7 días."
            ),
          hasta: z
            .string()
            .datetime()
            .optional()
            .describe(
              "Fin del rango en ISO 8601. Si se omite, ahora."
            ),
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
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
