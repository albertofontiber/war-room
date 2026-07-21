/**
 * AuditLog — trazabilidad genérica de cambios en el war room.
 *
 * Helper fire-and-forget que registra creaciones/ediciones/borrados de
 * entidades sensibles en la tabla `AuditLog` (ver prisma/schema.prisma).
 *
 * Convención:
 *   - create → solo `after`
 *   - update → `before` + `after`, idealmente solo con los campos que cambiaron
 *   - delete → solo `before`
 *
 * Si la operación falla, NO lanza — solo loguea por consola. La auditoría no
 * debe romper el flujo principal.
 *
 * Complementa (no reemplaza) `CrmLog` (cambios de stage del funnel) y
 * `FinderAccessLog` (acciones del portal de finders), que siguen como están.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { log } from "@/lib/logger";

export type AuditActorType = "admin" | "finder" | "system";
export type AuditAction = "create" | "update" | "delete";
export type AuditEntityType =
  | "empresa"
  | "tarea"
  | "nota"
  | "finder"
  | "contacto"
  | "user";

export interface AuditLogInput {
  actorType: AuditActorType;
  actorId?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | number | null;
  // Aceptamos `unknown` para que los callers puedan pasar objetos con `Date`,
  // `Decimal`, etc. — el helper serializa con JSON.stringify (Date → ISO string).
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

/** Serializa a algo que Prisma acepte como JsonValue (Date → ISO string, etc.). */
function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (v === undefined || v === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId != null ? String(input.entityId) : null,
        before: toJson(input.before),
        after: toJson(input.after),
        metadata: toJson(input.metadata),
      },
    });
  } catch (err) {
    log.error("lib/audit-log", err);
  }
}

/**
 * Calcula el diff de campos entre dos objetos planos.
 * Devuelve dos objetos `before`/`after` que solo contienen las claves cuyo
 * valor cambió — útil para `auditLog({ action: 'update', before, after })`.
 *
 * Solo compara las claves presentes en `next`. Si un campo está en `prev`
 * pero no en `next`, se ignora (no se considera cambio).
 */
export function diffFields<T extends Record<string, unknown>>(
  prev: T,
  next: Partial<T>
): { before: Partial<T>; after: Partial<T> } {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  for (const key in next) {
    const a = prev[key];
    const b = next[key];
    if (!shallowEqual(a, b)) {
      before[key] = a;
      after[key] = b;
    }
  }
  return { before, after };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a == null || b == null) return a === b;
  return false;
}

// Re-export para los callers que necesiten Prisma.JsonNull, etc.
export { Prisma };
