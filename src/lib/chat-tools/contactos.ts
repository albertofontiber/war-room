import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditLog, diffFields } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import type { ChatToolContext } from "./types";

export function buildBuscarContactoTool() {
  return tool({
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
  });
}

export function buildCrearContactoTool({ currentUser }: ChatToolContext) {
  return tool({
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
        .describe(
          "Cargo / rol. Ej: 'Director General', 'Responsable de compras'. Opcional."
        ),
      email: z
        .string()
        .max(320)
        .optional()
        .describe(
          "Email del contacto. Opcional pero recomendado — es lo que alimenta el matcher del buzón."
        ),
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
  });
}

export function buildActualizarContactoTool({ currentUser }: ChatToolContext) {
  return tool({
    description:
      "Modifica un contacto existente: cualquiera de nombre, cargo, email, teléfono, notas. Usa SIEMPRE buscar_contacto antes para el contactoId. Solo pasa los campos que cambian (null para vaciar uno). Útil para 'añade/cambia el email de X' o 'corrige el cargo de Y'. Auditado.",
    inputSchema: z.object({
      contactoId: z
        .number()
        .int()
        .positive()
        .describe("ID del contacto (obtenido vía buscar_contacto)."),
      nombre: z
        .string()
        .min(1)
        .max(255)
        .optional()
        .describe("Nuevo nombre. Omitir si no cambia."),
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
            error:
              "No has pasado ningún campo a modificar. Indica al menos uno.",
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
  });
}
