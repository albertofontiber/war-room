/**
 * Schemas de validación con zod para bodies de endpoints CRM que MUTAN datos.
 *
 * Patrón: importa el schema, haz `const parsed = Schema.safeParse(await req.json())`,
 * y si `!parsed.success` devuelve 400 con los mensajes. Los endpoints pasan a trabajar
 * con `parsed.data` tipado en lugar del cast manual `as { ... }`.
 */

import { z } from "zod";
import { DEAL_STAGES, TAREA_TIPOS } from "@/lib/crm";

const trimmedString = z.string().trim();
const nonEmptyString = trimmedString.min(1);
const nullableDateString = z
  .union([z.string().datetime({ offset: true }), z.string().length(0), z.null()])
  .optional();

export const TareaCreateSchema = z.object({
  tipo: z.enum(TAREA_TIPOS as [string, ...string[]]).optional(),
  titulo: nonEmptyString,
  descripcion: z.string().nullable().optional(),
  fechaLimite: nullableDateString,
  asignadoId: z.string().nullable().optional(),
});

export const TareaUpdateSchema = z
  .object({
    tipo: z.enum(TAREA_TIPOS as [string, ...string[]]).optional(),
    titulo: nonEmptyString.optional(),
    descripcion: z.string().nullable().optional(),
    fechaLimite: nullableDateString,
    asignadoId: z.string().nullable().optional(),
    completada: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty body" });

export const NotaCreateSchema = z.object({
  contenido: nonEmptyString,
});

export const NotaUpdateSchema = z.object({
  contenido: nonEmptyString,
});

export const StageChangeSchema = z.object({
  dealStage: z.union([
    z.enum(DEAL_STAGES as [string, ...string[]]),
    z.null(),
  ]),
  note: z.string().optional(),
});

export const FinderAssignSchema = z.object({
  finderId: z.string().nullable(),
});

export const GrupoAssignSchema = z.object({
  grupoNombre: z.string().nullable().optional(),
});

export const PerimetroPatchSchema = z.object({
  enPerimetro: z.boolean(),
});

/** Helper común: convierte ZodError → 400 JSON limpio (sin trazas internas). */
export function zodError(error: z.ZodError): Response {
  const issues = error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
  return Response.json(
    { error: "Invalid input", issues },
    { status: 400 }
  );
}
