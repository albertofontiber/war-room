/**
 * Matcher Calendar Events → Tareas.
 *
 * Para cada evento del calendario:
 *   1. Skip si es cancelación nueva sin ingestar (no creamos tareas para algo
 *      que no pasó). Si el evento YA estaba ingerido y ahora se cancela,
 *      ver "Cancelación de evento ya ingerido" abajo.
 *   2. Extrae attendees (incluido organizer), normalizados a lowercase.
 *   3. Filtra los `@fontiber.com` (interno).
 *   4. Busca matches en `Contacto.email`.
 *   5. Por cada match: si NO existía CalendarIngest → CREATE Tarea+Ingest.
 *      Si YA existía → UPDATE (ver "Actualización de evento ya ingerido").
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
 * Actualización de evento ya ingerido (v2):
 *   - Campos puramente derivados del calendario se actualizan SIEMPRE:
 *     `titulo` (subject), `tipo` (online/presencial), `fechaLimite` (start),
 *     y los espejos en `CalendarIngest` (startAt/endAt/subject/isOnlineMeeting).
 *   - Campos que el usuario puede haber editado a mano se respetan: si
 *     `Tarea.resultado` no es null, asumimos que fue tocada manualmente y
 *     NO sobrescribimos `completada/completadaAt/resultado`. Esto cubre el
 *     caso "Alberto rellenó qué pasó en la reunión y luego el evento se
 *     reagenda" — la nota se preserva.
 *
 * Cancelación de evento ya ingerido (v2):
 *   - Si pasa a `isCancelled=true` y la tarea NO fue editada (resultado==null),
 *     se marca como completada con `resultado="Reunión cancelada por el
 *     organizador"`. Sale del Kanban de pendientes pero queda como rastro.
 *   - Si la tarea ya fue editada, no tocamos resultado/completada — el
 *     usuario ya tomó nota de algo distinto.
 *
 * Privacy: eventos que NO matchean ningún Contacto no dejan rastro en BD.
 * Solo se persiste subject + recipientEmail + start/end para los que sí entran.
 *
 * Limitaciones conocidas v2 (ver TODOs):
 *   - Eventos recurrentes se ingestan UNA vez (toda la serie). Si se quiere
 *     una tarea por ocurrencia, refactorizar a fetch de `/calendarView`.
 *   - Si un Contacto cambia tras la ingesta inicial (otra empresa pasa a
 *     usar ese email), las tareas existentes mantienen el `empresaId`
 *     original — no migramos la relación.
 */

import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import {
  listCalendarEventsSince,
  attendeeEmailsOf,
  extractEmailsFromBody,
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
  tareasUpdated: number;
  errors: number;
  newCursor: Date | null;
};

const CANCELLED_RESULT_TEXT = "Reunión cancelada por el organizador";

/** True si el email es externo (no @fontiber.com) y tiene formato válido. */
function isExternalEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1) !== FONTIBER_DOMAIN;
}

/** Filtra attendees @fontiber.com (descartamos eventos solo internos). */
function externalAttendees(event: CalendarEvent): string[] {
  return attendeeEmailsOf(event).filter(isExternalEmail);
}

/**
 * Devuelve la unión de attendees externos + emails encontrados en el body
 * (también externos). Caso de uso: el organizador hace un block en su
 * calendario sin invitar formalmente al contacto, pero menciona su email
 * en el cuerpo. Ej: invite "[BLOCK] Test videollamada" con un solo asistente
 * interno y `silvaglez.alberto@gmail.com` en el body → debe matchear.
 */
function externalCandidates(event: CalendarEvent): string[] {
  const fromAttendees = externalAttendees(event);
  const fromBody = extractEmailsFromBody(event.body).filter(isExternalEmail);
  return Array.from(new Set([...fromAttendees, ...fromBody]));
}

/**
 * Procesa un evento individual. Tres caminos posibles:
 *   1. Si NO existía CalendarIngest y matchea Contacto → CREATE Tarea+Ingest.
 *   2. Si YA existía CalendarIngest → diff y UPDATE de campos relevantes.
 *   3. Otros casos: skip (cancelado nuevo, solo-interno, sin match).
 *
 * Si hay varios matches en attendees (raro), usamos el primero (criterio
 * simplificado igual que email matcher; refactorizar a N:M si surge la
 * necesidad).
 *
 * Retorna `{ created, updated, matched, skipped }`. `matched=true` indica que
 * el evento corresponde a un Contacto/CalendarIngest conocido (incluso si no
 * hubo cambios). `skipped` indica si el evento se descartó por ser cancelado
 * nuevo o solo-interno.
 */
async function ingestCalendarEvent(
  event: CalendarEvent,
  upn: string
): Promise<{
  created: boolean;
  updated: boolean;
  matched: boolean;
  skipped: "cancelled" | "internal-only" | null;
}> {
  // Dedup por iCalUId — única forma estable cross-user de identificar la
  // misma reunión en dos buzones distintos (alberto + gabriel invitados).
  // Lo consultamos PRIMERO (incluso para eventos cancelados) porque si está
  // ingerido ya, una cancelación es un evento de UPDATE — la rama de cancel
  // es relevante para la lógica de v2.
  const existing = await prisma.calendarIngest.findUnique({
    where: { iCalUId: event.iCalUId },
    select: {
      id: true,
      tareaId: true,
      startAt: true,
      endAt: true,
      subject: true,
      isOnlineMeeting: true,
    },
  });

  if (existing) {
    const result = await applyCalendarUpdate(existing, event, upn);
    return { created: false, updated: result.updated, matched: true, skipped: null };
  }

  // Cancelados NO ingeridos — el organizador anuló la reunión antes de que
  // la viéramos. No creamos histórico de algo que no pasó.
  if (event.isCancelled) {
    return { created: false, updated: false, matched: false, skipped: "cancelled" };
  }

  const candidates = externalCandidates(event);
  if (candidates.length === 0) {
    // No hay attendees externos NI emails externos en el body. Skip.
    return { created: false, updated: false, matched: false, skipped: "internal-only" };
  }

  const contactos = await prisma.contacto.findMany({
    where: { email: { in: candidates } },
    select: { id: true, email: true, empresaId: true, nombre: true },
  });
  if (contactos.length === 0) {
    return { created: false, updated: false, matched: false, skipped: null };
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
    return { created: true, updated: false, matched: true, skipped: null };
  } catch (err) {
    // Race: otro tick procesó el mismo iCalUId entre nuestro findUnique y
    // el create. Constraint @unique de iCalUId revienta — tratamos como
    // ya ingerido.
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { created: false, updated: false, matched: true, skipped: null };
    }
    throw err;
  }
}

type ExistingIngest = {
  id: number;
  tareaId: number | null;
  startAt: Date;
  endAt: Date;
  subject: string | null;
  isOnlineMeeting: boolean;
};

/**
 * Compara el evento Graph con el snapshot guardado en CalendarIngest +
 * la Tarea ligada. Si hay diff, actualiza ambos. Devuelve `updated:true`
 * solo si efectivamente cambió algo en BD.
 *
 * Convención sobre "tarea editada manualmente":
 *   `Tarea.resultado != null` actúa como flag conservador. El usuario solo
 *   rellena `resultado` cuando narra qué pasó en la reunión — si lo tocó,
 *   no sobreescribimos `completada/completadaAt/resultado` (preserva su
 *   nota). Los campos puramente derivados del calendario (titulo, tipo,
 *   fechaLimite) se actualizan siempre.
 */
async function applyCalendarUpdate(
  existing: ExistingIngest,
  event: CalendarEvent,
  upn: string
): Promise<{ updated: boolean }> {
  // Sin tarea ligada (ingest huérfano por SetNull tras delete manual): no
  // hay nada que actualizar. Sí refrescamos el snapshot del ingest para no
  // re-procesar en cada tick.
  if (!existing.tareaId) {
    await refreshIngestSnapshotIfChanged(existing, event);
    return { updated: false };
  }

  const tarea = await prisma.tarea.findUnique({
    where: { id: existing.tareaId },
    select: {
      titulo: true,
      tipo: true,
      fechaLimite: true,
      completada: true,
      completadaAt: true,
      resultado: true,
    },
  });
  // Tarea borrada manualmente: tratamos como no actualizable.
  if (!tarea) {
    await refreshIngestSnapshotIfChanged(existing, event);
    return { updated: false };
  }

  const startAt = new Date(event.start.dateTime + "Z");
  const endAt = new Date(event.end.dateTime + "Z");
  const subject = event.subject ?? "";
  const newTitulo = (subject.length > 0 ? subject : "(sin asunto)").slice(0, 255);
  const newTipo = event.isOnlineMeeting ? "videollamada" : "reunion_presencial";

  const userEdited = tarea.resultado !== null;

  const tareaUpdate: Record<string, unknown> = {};
  // Campos puramente derivados — siempre se actualizan.
  if (tarea.titulo !== newTitulo) tareaUpdate.titulo = newTitulo;
  if (tarea.tipo !== newTipo) tareaUpdate.tipo = newTipo;
  if (
    !tarea.fechaLimite ||
    tarea.fechaLimite.getTime() !== startAt.getTime()
  ) {
    tareaUpdate.fechaLimite = startAt;
  }

  // Campos que respetan edición manual.
  if (!userEdited) {
    if (event.isCancelled) {
      // Cancelación nueva (sabemos que existe el ingest, así que la había
      // creado un tick anterior) — completamos con texto explicativo.
      if (!tarea.completada || tarea.resultado !== CANCELLED_RESULT_TEXT) {
        tareaUpdate.completada = true;
        tareaUpdate.completadaAt = tarea.completadaAt ?? new Date();
        tareaUpdate.resultado = CANCELLED_RESULT_TEXT;
      }
    } else {
      // Recalcula pasado/futuro con la nueva fecha.
      const isPast = endAt.getTime() < Date.now();
      if (tarea.completada !== isPast) {
        tareaUpdate.completada = isPast;
        tareaUpdate.completadaAt = isPast ? endAt : null;
      }
    }
  }

  // Snapshot del CalendarIngest — refresca si cambió cualquier campo.
  const ingestUpdate: Record<string, unknown> = {};
  if (existing.startAt.getTime() !== startAt.getTime()) ingestUpdate.startAt = startAt;
  if (existing.endAt.getTime() !== endAt.getTime()) ingestUpdate.endAt = endAt;
  if ((existing.subject ?? "") !== subject) ingestUpdate.subject = subject;
  if (existing.isOnlineMeeting !== event.isOnlineMeeting) {
    ingestUpdate.isOnlineMeeting = event.isOnlineMeeting;
  }

  if (Object.keys(tareaUpdate).length === 0 && Object.keys(ingestUpdate).length === 0) {
    return { updated: false };
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(tareaUpdate).length > 0) {
      await tx.tarea.update({
        where: { id: existing.tareaId! },
        data: tareaUpdate,
      });
      void auditLog({
        actorType: "system",
        action: "update",
        entityType: "tarea",
        entityId: existing.tareaId!,
        before: pickAuditFields(tarea, tareaUpdate),
        after: {
          ...tareaUpdate,
          source: "graph-calendar",
          upn,
          iCalUId: event.iCalUId,
        },
      });
    }
    if (Object.keys(ingestUpdate).length > 0) {
      await tx.calendarIngest.update({
        where: { id: existing.id },
        data: ingestUpdate,
      });
    }
  });

  return { updated: Object.keys(tareaUpdate).length > 0 };
}

/**
 * Refresca solo el snapshot del CalendarIngest (sin tocar Tarea). Se usa
 * cuando la Tarea ligada ya no existe — para no procesar el evento de
 * nuevo en cada tick aunque no tenga tarea destino.
 */
async function refreshIngestSnapshotIfChanged(
  existing: ExistingIngest,
  event: CalendarEvent
): Promise<void> {
  const startAt = new Date(event.start.dateTime + "Z");
  const endAt = new Date(event.end.dateTime + "Z");
  const subject = event.subject ?? "";
  const ingestUpdate: Record<string, unknown> = {};
  if (existing.startAt.getTime() !== startAt.getTime()) ingestUpdate.startAt = startAt;
  if (existing.endAt.getTime() !== endAt.getTime()) ingestUpdate.endAt = endAt;
  if ((existing.subject ?? "") !== subject) ingestUpdate.subject = subject;
  if (existing.isOnlineMeeting !== event.isOnlineMeeting) {
    ingestUpdate.isOnlineMeeting = event.isOnlineMeeting;
  }
  if (Object.keys(ingestUpdate).length > 0) {
    await prisma.calendarIngest.update({
      where: { id: existing.id },
      data: ingestUpdate,
    });
  }
}

/** Devuelve solo los campos del `before` que aparecen en `after`. */
function pickAuditFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    out[key] = before[key];
  }
  return out;
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
    tareasUpdated: 0,
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
      const { created, updated, matched, skipped } = await ingestCalendarEvent(
        event,
        upn
      );
      if (skipped === "cancelled") stats.cancelledSkipped++;
      else if (skipped === "internal-only") stats.internalOnlySkipped++;
      if (created) stats.tareasCreated++;
      if (updated) stats.tareasUpdated++;
      // alreadyIngested = vimos el iCalUId pero no hubo cambios (ni create ni update).
      if (matched && !created && !updated) stats.alreadyIngested++;
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
  externalCandidates,
  ingestCalendarEvent,
  applyCalendarUpdate,
  CANCELLED_RESULT_TEXT,
};
