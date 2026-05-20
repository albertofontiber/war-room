/**
 * scripts/backfill-calendar-tasks.ts
 *
 * Backfill histórico de Calendar Events → Tareas tipo `videollamada` /
 * `reunion_presencial` matcheando contra los `Contacto` existentes en BD.
 * Pensado para correr una sola vez tras el import masivo de contactos
 * (2026-05-19) y popular el timeline desde Enero 2026.
 *
 * NO toca `CalendarIngestCursor` — el cron real-time (cada 30 min) sigue su
 * propio cursor desde 2026-05-11 hacia delante. Este script lee desde `SINCE`
 * (default 2026-01-01) hacia delante ignorando el cursor, y dedupe por
 * `CalendarIngest.iCalUId` (constraint @unique). Si un evento ya fue ingerido
 * por el cron de mayo, se salta limpio.
 *
 * Idempotente: re-ejecutar el script no duplica nada.
 *
 * Patrón clonado de `src/lib/calendar-task-matcher.ts:ingestCalendarEvent`
 * para no acoplar el script a esa función ni añadir flags al cron de prod.
 *
 * Diferencia con el cron real-time: el cron filtra por `lastModifiedDateTime`
 * (captura re-schedules y cancelaciones). El backfill filtra por start/end
 * para coger TODAS las reuniones que cayeron en el rango, independiente de
 * cuándo se modificaron por última vez. Esto evita perdernos un evento creado
 * en enero y nunca tocado desde entonces (lastModified < SINCE).
 *
 * Usage:
 *   npx tsx scripts/backfill-calendar-tasks.ts                  (dry-run)
 *   APPLY=1 npx tsx scripts/backfill-calendar-tasks.ts          (aplica)
 *   SINCE=2026-03-01 npx tsx scripts/backfill-calendar-tasks.ts (custom desde)
 *   UPN=alberto@fontiber.com npx tsx scripts/...                (solo un UPN)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";
import { graphFetch } from "../src/lib/graph-auth";
import {
  attendeeEmailsOf,
  extractEmailsFromBody,
  type CalendarEvent,
} from "../src/lib/calendar-graph";
import { auditLog } from "../src/lib/audit-log";

const APPLY = process.env.APPLY === "1";
const SINCE = new Date(process.env.SINCE ?? "2026-01-01T00:00:00Z");
const UNTIL = new Date(process.env.UNTIL ?? new Date().toISOString());
const FONTIBER_DOMAIN = "fontiber.com";

function getUpns(): string[] {
  if (process.env.UPN) return [process.env.UPN];
  const raw =
    process.env.EMAIL_TASK_OWNER_UPNS ??
    "alberto@fontiber.com,gabriel@fontiber.com";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const SELECT_FIELDS =
  "id,iCalUId,subject,isCancelled,isOnlineMeeting,start,end,lastModifiedDateTime,organizer,attendees,body";

/**
 * Lista eventos cuyo `start/dateTime` cae entre `since` y `until`. Distinto
 * del cron de prod (que filtra por `lastModifiedDateTime`): para backfill
 * queremos capturar TODAS las reuniones del rango aunque no se hayan tocado
 * desde su creación.
 */
async function listCalendarEventsInRange(
  upn: string,
  since: Date,
  until: Date
): Promise<CalendarEvent[]> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  const filter = encodeURIComponent(
    `start/dateTime ge '${sinceIso}' and start/dateTime le '${untilIso}'`
  );
  const orderby = encodeURIComponent("start/dateTime asc");
  let nextUrl: string | null =
    `/users/${encodeURIComponent(upn)}/events` +
    `?$select=${SELECT_FIELDS}&$filter=${filter}&$orderby=${orderby}&$top=50`;

  const all: CalendarEvent[] = [];
  while (nextUrl) {
    type GraphResponse = {
      value: CalendarEvent[];
      "@odata.nextLink"?: string;
    };
    const json: GraphResponse = await graphFetch(nextUrl);
    all.push(...json.value);
    nextUrl = json["@odata.nextLink"] ?? null;
  }
  return all;
}

function isExternalEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1) !== FONTIBER_DOMAIN;
}

function externalCandidates(event: CalendarEvent): string[] {
  const fromAttendees = attendeeEmailsOf(event).filter(isExternalEmail);
  const fromBody = extractEmailsFromBody(event.body).filter(isExternalEmail);
  return Array.from(new Set([...fromAttendees, ...fromBody]));
}

interface PlannedTarea {
  upn: string;
  iCalUId: string;
  graphEventId: string;
  startAt: Date;
  endAt: Date;
  subject: string;
  isOnlineMeeting: boolean;
  recipientEmail: string;
  contactoId: number;
  contactoNombre: string;
  empresaId: number;
  empresaNombre: string;
  isCancelled: boolean;
}

interface Stats {
  upn: string;
  fetched: number;
  cancelled: number;
  internalOnly: number;
  alreadyIngested: number;
  noMatch: number;
  toCreate: number;
  created: number;
  errors: number;
}

async function processUpn(upn: string): Promise<{ stats: Stats; planned: PlannedTarea[] }> {
  const stats: Stats = {
    upn,
    fetched: 0,
    cancelled: 0,
    internalOnly: 0,
    alreadyIngested: 0,
    noMatch: 0,
    toCreate: 0,
    created: 0,
    errors: 0,
  };
  const planned: PlannedTarea[] = [];

  console.log(
    `\n📅 [${upn}] Leyendo eventos start ∈ [${SINCE.toISOString()}, ${UNTIL.toISOString()}]…`
  );
  const events = await listCalendarEventsInRange(upn, SINCE, UNTIL);
  stats.fetched = events.length;
  console.log(`   ${events.length} eventos encontrados en Graph.`);

  for (const event of events) {
    // Cancelados sin ingestar previo → skip (no creamos histórico de algo
    // que no pasó). Esto es la misma regla del cron real-time.
    if (event.isCancelled) {
      const existing = await prisma.calendarIngest.findUnique({
        where: { iCalUId: event.iCalUId },
        select: { id: true },
      });
      if (!existing) {
        stats.cancelled++;
        continue;
      }
      // Si ya estaba ingerido, lo tratamos como alreadyIngested para no
      // duplicar — el cron real-time se encarga de propagar la cancelación.
      stats.alreadyIngested++;
      continue;
    }

    // Dedup por iCalUId.
    const existing = await prisma.calendarIngest.findUnique({
      where: { iCalUId: event.iCalUId },
      select: { id: true },
    });
    if (existing) {
      stats.alreadyIngested++;
      continue;
    }

    const candidates = externalCandidates(event);
    if (candidates.length === 0) {
      stats.internalOnly++;
      continue;
    }

    const contactos = await prisma.contacto.findMany({
      where: { email: { in: candidates } },
      select: {
        id: true,
        email: true,
        nombre: true,
        empresaId: true,
        empresa: { select: { nombre: true } },
      },
    });
    if (contactos.length === 0) {
      stats.noMatch++;
      continue;
    }

    const c = contactos[0];
    const startAt = new Date(event.start.dateTime + "Z");
    const endAt = new Date(event.end.dateTime + "Z");
    const subject = event.subject ?? "";
    const isOnline = event.isOnlineMeeting;

    const plan: PlannedTarea = {
      upn,
      iCalUId: event.iCalUId,
      graphEventId: event.id,
      startAt,
      endAt,
      subject,
      isOnlineMeeting: isOnline,
      recipientEmail: c.email ?? "",
      contactoId: c.id,
      contactoNombre: c.nombre,
      empresaId: c.empresaId,
      empresaNombre: c.empresa.nombre,
      isCancelled: event.isCancelled,
    };
    planned.push(plan);
    stats.toCreate++;

    if (!APPLY) continue;

    const titulo = (subject.length > 0 ? subject : "(sin asunto)").slice(0, 255);
    const tipoTarea = isOnline ? "videollamada" : "reunion_presencial";
    const descripcion = `Reunión con ${c.nombre}${c.email ? ` <${c.email}>` : ""}`;
    const organizerEmail =
      event.organizer?.emailAddress?.address?.toLowerCase() ?? "";
    const isPast = endAt.getTime() < Date.now();

    try {
      await prisma.$transaction(async (tx) => {
        const tarea = await tx.tarea.create({
          data: {
            empresaId: c.empresaId,
            tipo: tipoTarea,
            titulo,
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
            source: "backfill-calendar-tasks",
            upn,
            iCalUId: event.iCalUId,
          },
        });
      });
      stats.created++;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Unique constraint")) {
        stats.alreadyIngested++;
        stats.toCreate--;
      } else {
        console.error(`   ❌ Error en ${event.iCalUId}:`, err);
        stats.errors++;
      }
    }
  }

  return { stats, planned };
}

async function main() {
  const upns = getUpns();
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Backfill calendar → tareas (${APPLY ? "APLICAR" : "DRY-RUN"})`);
  console.log(`  Desde: ${SINCE.toISOString()}`);
  console.log(`  Hasta: ${UNTIL.toISOString()}`);
  console.log(`  UPNs:  ${upns.join(", ")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const allStats: Stats[] = [];
  const allPlanned: PlannedTarea[] = [];

  for (const upn of upns) {
    try {
      const { stats, planned } = await processUpn(upn);
      allStats.push(stats);
      allPlanned.push(...planned);
    } catch (err) {
      console.error(`❌ Error procesando ${upn}:`, err);
      allStats.push({
        upn,
        fetched: 0,
        cancelled: 0,
        internalOnly: 0,
        alreadyIngested: 0,
        noMatch: 0,
        toCreate: 0,
        created: 0,
        errors: 1,
      });
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Resumen por UPN:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const s of allStats) {
    console.log(`  ${s.upn}`);
    console.log(`    fetched:          ${s.fetched}`);
    console.log(`    cancelled:        ${s.cancelled}`);
    console.log(`    internal-only:    ${s.internalOnly}`);
    console.log(`    already ingested: ${s.alreadyIngested}`);
    console.log(`    no match:         ${s.noMatch}`);
    console.log(`    to create:        ${s.toCreate}`);
    if (APPLY) {
      console.log(`    created:          ${s.created}`);
      console.log(`    errors:           ${s.errors}`);
    }
  }

  // Dedup cross-UPN: si alberto y gabriel están en la misma reunión, ambos
  // verán el evento (mismo iCalUId). Solo se creará UNA tarea por la
  // constraint @unique, pero el plan dry-run lo cuenta dos veces. Avisamos.
  const planByICal = new Map<string, PlannedTarea>();
  let dupsAcrossUpn = 0;
  for (const p of allPlanned) {
    if (planByICal.has(p.iCalUId)) {
      dupsAcrossUpn++;
    } else {
      planByICal.set(p.iCalUId, p);
    }
  }
  const uniquePlanned = [...planByICal.values()];

  if (!APPLY && uniquePlanned.length > 0) {
    if (dupsAcrossUpn > 0) {
      console.log(
        `\nℹ️  ${dupsAcrossUpn} eventos compartidos entre UPNs (alberto + gabriel en la misma reunión). Se cuentan 1 vez en el plan único.`
      );
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Desglose por empresa (${uniquePlanned.length} tareas planificadas únicas):`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const byEmpresa = new Map<string, number>();
    for (const p of uniquePlanned) {
      byEmpresa.set(p.empresaNombre, (byEmpresa.get(p.empresaNombre) ?? 0) + 1);
    }
    const sorted = [...byEmpresa.entries()].sort((a, b) => b[1] - a[1]);
    for (const [empresa, count] of sorted) {
      console.log(`  ${count.toString().padStart(4)} · ${empresa}`);
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Reuniones planificadas (orden cronológico):");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const sortedByDate = [...uniquePlanned].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime()
    );
    for (const p of sortedByDate) {
      const dt = p.startAt.toISOString().slice(0, 16).replace("T", " ");
      const tipo = p.isOnlineMeeting ? "🎥" : "📍";
      const subj = (p.subject || "(sin asunto)").slice(0, 60);
      console.log(`  ${dt} ${tipo} ${p.empresaNombre} · ${p.recipientEmail}`);
      console.log(`            "${subj}"`);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (!APPLY) {
    console.log(`✅ DRY-RUN completado. Tareas únicas que se crearían: ${uniquePlanned.length}`);
    console.log(`   Para aplicar: APPLY=1 npx tsx scripts/backfill-calendar-tasks.ts`);
  } else {
    const totalCreated = allStats.reduce((a, s) => a + s.created, 0);
    const totalErrors = allStats.reduce((a, s) => a + s.errors, 0);
    console.log(`✅ Backfill aplicado. Tareas creadas: ${totalCreated}, errors: ${totalErrors}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
