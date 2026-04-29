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
// Acepta:
//   - ISO 8601 con offset: "2026-04-29T10:00:00+02:00" (datetime-local con TZ)
//   - "yyyy-mm-dd": el formato nativo del <input type="date"> de HTML (sin hora ni offset)
//   - string vacío o null para limpiar el campo
// El endpoint de tareas hace `new Date(fechaLimite)` que parsea ambos formatos correctamente.
const nullableDateString = z
  .union([
    z.string().datetime({ offset: true }),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (yyyy-mm-dd)"),
    z.string().length(0),
    z.null(),
  ])
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

// ─── Leads anónimos ───────────────────────────────────────────────────────────
// Empresa sin identificar (confidencial). Nombre = alias acordado, CIF se
// auto-genera. Sector/provincia/CCAA/financieros son opcionales pero útiles.

const SECTORES = ["PCI", "seguridad_electronica", "mixto"] as const;

export const LeadLinkSchema = z.object({
  targetEmpresaId: z.number().int().positive(),
});

export const FinderSetPasswordSchema = z.object({
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
});

export const FinderCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  name: nonEmptyString.max(100),
  commissionPct: z.number().min(0).max(100).nullable().optional(),
  // Password inicial obligatoria — el admin la genera o la escribe en el modal.
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
});

// PATCH /api/finders/:id — todos los campos opcionales pero al menos uno.
// La password NO se cambia desde aquí; eso vive en POST /api/finders/:id/password.
export const FinderUpdateSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Email inválido").optional(),
    name: nonEmptyString.max(100).optional(),
    commissionPct: z.number().min(0).max(100).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty body" });

// ─── Portal finders: notas, tareas y actividades ─────────────────────────────
// Los schemas del portal son un subset de los del war room. No permiten
// setear autores (se infieren de la sesión) ni flags de admin
// (visibleAFinder, asignadoId a un User, etc.).

const ACTIVIDAD_TIPOS = ["nota", "llamada", "email", "reunion"] as const;

export const PortalNotaCreateSchema = z.object({
  contenido: nonEmptyString,
});

export const PortalNotaUpdateSchema = z.object({
  contenido: nonEmptyString,
});

export const PortalTareaCreateSchema = z.object({
  tipo: z.enum(TAREA_TIPOS as [string, ...string[]]).optional(),
  titulo: nonEmptyString,
  descripcion: z.string().nullable().optional(),
  fechaLimite: nullableDateString,
});

export const PortalTareaUpdateSchema = z
  .object({
    tipo: z.enum(TAREA_TIPOS as [string, ...string[]]).optional(),
    titulo: nonEmptyString.optional(),
    descripcion: z.string().nullable().optional(),
    fechaLimite: nullableDateString,
    completada: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty body" });

export const PortalActividadCreateSchema = z.object({
  tipo: z.enum(ACTIVIDAD_TIPOS),
  texto: z.string().nullable().optional(),
  fecha: z.string().datetime({ offset: true }).optional(),
});

export const PortalActividadUpdateSchema = z
  .object({
    tipo: z.enum(ACTIVIDAD_TIPOS).optional(),
    texto: z.string().nullable().optional(),
    fecha: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty body" });

export const ProposalCreateSchema = z.object({
  companyName: nonEmptyString,
  cif: z.string().trim().min(0).optional().nullable(),
  website: z.string().trim().optional().nullable(),
  contactName: z.string().trim().optional().nullable(),
  contactRole: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const PROPOSAL_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DUPLICATE",
  "OUT_OF_SCOPE",
  "REJECTED",
] as const;

export const ProposalReviewSchema = z.object({
  status: z.enum(PROPOSAL_STATUSES),
  rejectionReason: z.string().trim().optional().nullable(),
  // Si status=ACCEPTED, permite vincular la propuesta a una empresa existente
  // o dejar que el admin la cree manualmente después.
  empresaId: z.number().int().positive().optional().nullable(),
});

export const LeadCreateSchema = z.object({
  nombre: nonEmptyString,                            // alias visible ("Asher")
  sector: z.enum(SECTORES).nullable().optional(),
  provincia: z.string().nullable().optional(),
  ccaa: z.string().nullable().optional(),
  dealStage: z.enum(DEAL_STAGES as [string, ...string[]]),
  ownerUserId: z.string().nullable().optional(),
  finderId: z.string().nullable().optional(),
  // Financieros del último año conocido (se crea un Financiero anio=current-1 o anio custom)
  anioFinanciero: z.number().int().min(2000).max(2030).nullable().optional(),
  ingresos: z.number().nullable().optional(),
  margenBruto: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  empleados: z.number().int().min(0).nullable().optional(),
  descripcion: z.string().nullable().optional(),
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
