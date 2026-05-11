/**
 * Matcher Calendar Events → Tareas.
 *
 * Para cada evento del calendario:
 *   1. Skip si está cancelado o no tiene asistentes externos.
 *   2. Extrae attendees (incluido organizer), normalizados a lowercase.
 *   3. Filtra los `@fontiber.com` (interno).
 *   4. Busca matches en `Contacto.email`.
 *   5. Por cada match, crea (idempotente) una Tarea + CalendarIngest.
 *      Dedup por `iCalUId` único (cross-user: si alberto Y gabriel están en
 *      la misma reunión, ambos calendarios tienen el mismo iCalUId → 1 tarea).
 *
 * Tipo de tarea:
 *   - `isOnlineMeeting: true` → `videollamada`
 *   - else                    → `reunion_presencial`
 *
 * Estado de la tarea según fecha:
 *   - Evento en el FUTURO al ingestar → pending (`completada: false`,
 *     `fechaLimite: start`). Aparece en bandeja del CRM.
 *   - Evento en el PASADO → completed (`completada: true`,
 *     `completadaAt: end`, `fechaLimite: start`). Registro histórico.
 *
 * Privacy: eventos que NO matchean ningún Contacto no dejan rastro en BD.
 * Solo se persiste subject + recipientEmail + start/end para los que sí entran.
 *
 * Limitaciones conocidas v1 (ver TODOs):
 *   - No actualiza tareas si el evento se reagenda tras ingestar (el cursor
 *     sí captura la modificación, pero `iCalUId` ya existe → no-op por dedup).
 *   - Eventos recurrentes se ingestan UNA vez (toda la serie). Si se quiere
 *     una tarea por ocurrencia, refactorizar a fetch de `/calendarView`.
 */

import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import {
  listCalendarEventsSince,
  attendeeEmailsOf,
  type CalendarEvent,
} from "@/lib/calendar-graph";

const FONTIBER_DOMAIN = "fontiber.com";

export type CalendarIngestStats = {
  upn: string;
  fetched: number;
  alreadyIngested: number;
  matched: number;
  noMatch: number;
  cancelledSkipped: number;
  internalOnlySkipped: number;
  tareasCreated: number;
  errors: number;
  newCursor: Date | null;
};

/** Filtra attendees @fontiber.com (descartamos eventos solo internos). */
function externalAttendees(event: CalendarEvent): string[] {
  return attendeeEmailsOf(event).filter((email) => {
    const at = email.lastIndexOf("@");
    if (at < 0) return false;
    const domain = email.slice(at + 1);
    return domain !== FONTIBER_DOMAIN;
  });
}

/**
 * Procesa un evento individual. Si un attendee externo matchea con
 * `Contacto.email`, crea Tarea+CalendarIngest atómicamente. Si hay varios
 * matches (raro), usa el primero (criterio simplificado igual que email
 * matcher; refactorizar a N:M si surge la necesidad).
 *
 * Retorna `{ created, matched, skipped }` donde `skipped` indica si el evento
 * se descartó por ser cancelado o solo-interno.
 */
async function ingestCalendarEvent(
  event: CalendarEvent,
  upn: string
): Promise<{
  created: boolean;
  matched: boolean;
  skipped: "cancelled" | "internal-only" | null;
}> {
  // Skip cancelados — el organizador anuló la reunión, no tiene sentido
  // crear tarea histórica de algo que no pasó. Si el evento se cancela
  // DESPUÉS de que ingestáramos la tarea, queda huérfana — limitación v1.
  if (event.isCancelled) {
    return { created: false, matched: false, skipped: "cancelled" };
  }

  // Dedup por iCalUId — única forma estable cross-user de identificar la
  // misma reunión en dos buzones distintos (alberto + gabriel invitados).
  const existing = await prisma.calendarIngest.findUnique({
    where: { iCalUId: event.iCalUId },
    select: { id: true },
  });
  if (existing) return { created: false, matched: true, skipped: null };

  const externals = externalAttendees(event);
  if (externals.length === 0) {
    return { created: false, matched: false, skipped: "internal-only" };
  }

  const contactos = await prisma.contacto.findMany({
    where: { email: { in: externals } },
    select: { id: true, email: true, empresaId: true, nombre: true },
  });
  if (contactos.length === 0) {
    return { created: false, matched: false, skipped: null };
  }

  const startAt = new Date(event.start.dateTime + "Z");
  const endAt = new Date(event.end.dateTime + "Z");
  const subject = event.subject ?? "";
  const isOnline = event.isOnlineMeeting;
  const c = contactos[0];

  // Pasado vs futuro: si el evento ya pasó cuando lo ingestamos, lo creamos
  // como registro histórico completado. Si es futuro, queda pending.
  const isPast = endAt.getTime() < Date.now();
  const titulo = subject.length > 0 ? subject : "(sin asunto)";
  const tipoTarea = isOnline ? "videollamada" : "reunion_presencial";
  const descripcion = `Reunión con ${c.nombre}${c.email ? ` <${c.email}>` : ""}`;
  const organizerEmail =
    event.organizer?.emailAddress?.address?.toLowerCase() ?? "";

  try {
    await prisma.$transaction(async (tx) => {
      const tarea = await tx.tarea.create({
        data: {
          empresaId: c.empresaId,
          tipo: tipoTarea,
          titulo: titulo.slice(0, 255),
          descripcion,
          completada: isPast,
          completadaAt: isPast ? endAt : null,
          fechaLimite: startAt,
        },
      });
      await tx.calendarIngest.create({
        data: {
          iCalUId: event.iCalUId,
          graphEventId: event.id,
          upn,
          organizerEmail,
          recipientEmail: c.email ?? "",
          contactoId: c.id,
          empresaId: c.empresaId,
          tareaId: tarea.id,
          startAt,
          endAt,
          subject,
          isOnlineMeeting: isOnline,
        },
      });
      void auditLog({
        actorType: "system",
        action: "create",
        entityType: "tarea",
        entityId: tarea.id,
        after: {
          empresaId: c.empresaId,
          tipo: tipoTarea,
          titulo: tarea.titulo,
          source: "graph-calendar",
          upn,
          iCalUId: event.iCalUId,
        },
      });
    });
    return { created: true, matched: true, skipped: null };
  } catch (err) {
    // Race: otro tick procesó el mismo iCalUId entre nuestro findUnique y
    // el create. Constraint @unique de iCalUId revienta — tratamos como
    // ya ingerido.
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { created: false, matched: true, skipped: null };
    }
    throw err;
  }
}

/**
 * Procesa los eventos del UPN desde el cursor. Actualiza el cursor al final
 * con el `lastModifiedDateTime` del último evento procesado.
 *
 * `firstRunWindowMs` controla la ventana inicial — default 7 días para que
 * el primer despliegue capture reuniones próximas sin tragarse el histórico
 * entero del calendario.
 */
export async function ingestCalendarForUpn(
  upn: string,
  opts: { firstRunWindowMs?: number } = {}
): Promise<CalendarIngestStats> {
  const stats: CalendarIngestStats = {
    upn,
    fetched: 0,
    alreadyIngested: 0,
    matched: 0,
    noMatch: 0,
    cancelledSkipped: 0,
    internalOnlySkipped: 0,
    tareasCreated: 0,
    errors: 0,
    newCursor: null,
  };

  const cursor = await prisma.calendarIngestCursor.findUnique({ where: { upn } });
  const since =
    cursor?.lastModifiedDateTime ??
    new Date(Date.now() - (opts.firstRunWindowMs ?? 7 * 24 * 60 * 60 * 1000));

  let events: CalendarEvent[];
  try {
    events = await listCalendarEventsSince(upn, since);
  } catch (err) {
    log.error("calendar-task-matcher:listEvents", err, { upn });
    stats.errors++;
    return stats;
  }
  stats.fetched = events.length;

  let lastProcessed: Date | null = null;
  for (const event of events) {
    try {
      const { created, matched, skipped } = await ingestCalendarEvent(
        event,
        upn
      );
      if (skipped === "cancelled") stats.cancelledSkipped++;
      else if (skipped === "internal-only") stats.internalOnlySkipped++;
      if (created) stats.tareasCreated++;
      if (matched && !created) stats.alreadyIngested++;
      if (matched) stats.matched++;
      else if (!skipped) stats.noMatch++;
    } catch (err) {
      log.error("calendar-task-matcher:ingest", err, {
        upn,
        iCalUId: event.iCalUId,
      });
      stats.errors++;
      continue; // No avanzamos cursor si falla — siguiente ronda reintenta
    }
    lastProcessed = new Date(event.lastModifiedDateTime);
  }

  if (lastProcessed) {
    await prisma.calendarIngestCursor.upsert({
      where: { upn },
      create: { upn, lastModifiedDateTime: lastProcessed },
      update: { lastModifiedDateTime: lastProcessed },
    });
    stats.newCursor = lastProcessed;
  }

  return stats;
}

/** Test helper: expone funciones internas para los tests. */
export const __testing__ = {
  externalAttendees,
  ingestCalendarEvent,
};
