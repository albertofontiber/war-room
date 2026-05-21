/**
 * Timeline unificado por empresa.
 *
 * Combina en una sola lista cronológica eventos heterogéneos guardados en
 * varias tablas:
 *   - Notas (creación)
 *   - Tareas completadas (con o sin resultado)
 *   - Cambios de stage (CrmLog)
 *   - Señales BORME
 *   - Emails ingestados sin tarea ligada (caso raro: EmailIngest huérfano)
 *   - Reuniones de calendar sin tarea ligada (caso raro: CalendarIngest huérfano)
 *
 * No materializamos en una tabla nueva — se construye on-the-fly. Las queries
 * son paralelas (Promise.all) y cada tabla ya tiene índice por
 * `(empresaId, createdAt)` o equivalente, así que el coste es lineal con el
 * volumen de eventos visible.
 *
 * Discriminador `kind` permite al cliente:
 *   1. Categorizar (conversación, actividad, pipeline, señales, sistema)
 *   2. Renderizar con densidad apropiada (full | compact)
 *   3. Filtrar por categoría/autor/búsqueda
 *
 * Filtrado de visibilidad para finders (`scope: "portal"`):
 *   - Notas: solo del finder o admin con `visibleAFinder=true`
 *   - Tareas, BORMEs, Pipeline (CrmLog): se devuelven todas — el portal hoy
 *     ya muestra tareas completas del deal y los stages son públicos al finder
 *     asignado. Si surge necesidad de ocultar algo, añadimos flag aquí.
 *
 * Sistema (creación auto de OneDrive/Notion, edición de campos, etc.) queda
 * fuera del MVP — se añadirá cuando integremos AuditLog filtrado.
 */

import { prisma } from "@/lib/prisma";
import type {
  TimelineActor,
  TimelineEvent,
  TimelineOptions,
} from "@/lib/timeline-types";

export type {
  TimelineActor,
  TimelineEvent,
  TimelineScope,
  TimelineOptions,
} from "@/lib/timeline-types";

/**
 * Carga el timeline completo de una empresa. Por ahora sin paginación: el
 * caller recibe todos los eventos ordenados desc. Si una empresa supera ~500
 * eventos, paginar por fecha cursor (no se espera en MVP — un deal típico
 * tiene 20–100 eventos a lo largo de meses).
 */
export async function getEmpresaTimeline(
  empresaId: number,
  opts: TimelineOptions
): Promise<TimelineEvent[]> {
  const [notas, tareasCompletadas, crmLogs, bormes] = await Promise.all([
    loadNotas(empresaId, opts),
    loadTareasCompletadas(empresaId, opts),
    loadCrmLogs(empresaId),
    loadBormes(empresaId),
  ]);

  const events: TimelineEvent[] = [
    ...notas,
    ...tareasCompletadas,
    ...crmLogs,
    ...bormes,
  ];

  // Orden desc estable por fecha. Empate (improbable) lo desempata `id`.
  events.sort((a, b) => {
    const ta = new Date(a.fecha).getTime();
    const tb = new Date(b.fecha).getTime();
    if (ta !== tb) return tb - ta;
    return a.id.localeCompare(b.id);
  });

  return events;
}

async function loadNotas(
  empresaId: number,
  opts: TimelineOptions
): Promise<TimelineEvent[]> {
  const where =
    opts.scope === "portal" && opts.finderId
      ? {
          empresaId,
          OR: [
            { autorFinderId: opts.finderId },
            { visibleAFinder: true },
          ],
        }
      : { empresaId };

  const notas = await prisma.nota.findMany({
    where,
    select: {
      id: true,
      contenido: true,
      createdAt: true,
      parentId: true,
      visibleAFinder: true,
      autor: { select: { id: true, name: true } },
      autorFinder: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return notas.map<TimelineEvent>((n) => ({
    kind: "nota",
    id: `nota-${n.id}`,
    fecha: n.createdAt.toISOString(),
    actor: actorFromAuthors(n.autor, n.autorFinder),
    density: "full",
    payload: {
      notaId: n.id,
      contenido: n.contenido,
      parentId: n.parentId,
      visibleAFinder: n.visibleAFinder,
    },
  }));
}

async function loadTareasCompletadas(
  empresaId: number,
  opts: TimelineOptions
): Promise<TimelineEvent[]> {
  const [tareas, users] = await Promise.all([
    prisma.tarea.findMany({
      where: { empresaId, completada: true },
      select: {
        id: true,
        tipo: true,
        titulo: true,
        resultado: true,
        completadaAt: true,
        createdAt: true,
        autor: { select: { id: true, name: true } },
        autorFinder: { select: { id: true, name: true } },
        asignado: { select: { id: true, name: true } },
        asignadoFinder: { select: { id: true, name: true } },
        // Detecta si la tarea vino de un cron — el join indirecto identifica
        // el origen. `upn`/`direction` resuelven el socio y el sentido; el
        // `contacto`/`body` alimentan la línea "De:/Para:" y el cuerpo.
        emailIngest: {
          select: {
            id: true,
            upn: true,
            direction: true,
            recipientEmail: true,
            body: true,
            contacto: { select: { nombre: true, email: true } },
          },
        },
        calendarIngest: { select: { id: true } },
      },
      orderBy: { completadaAt: "desc" },
    }),
    // Tabla diminuta (admins). Para mapear `EmailIngest.upn` → socio.
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
  ]);

  const userByEmail = new Map(
    users.map((u) => [u.email.toLowerCase(), { id: u.id, name: u.name }])
  );

  return tareas.map<TimelineEvent>((t) => {
    // Source: prioridad al ingest si existe, sino manual.
    let source: "manual" | "graph-email" | "graph-calendar" = "manual";
    if (t.emailIngest) source = "graph-email";
    else if (t.calendarIngest) source = "graph-calendar";

    // Dirección del email — solo para tareas ingeridas del email.
    const emailDirection: "saliente" | "entrante" | null = t.emailIngest
      ? t.emailIngest.direction === "entrante"
        ? "entrante"
        : "saliente"
      : null;

    // Contacto externo del email (línea "De:"/"Para:"). Si el Contacto se
    // borró (`contactoId` SetNull), caemos al email guardado en el ingest.
    const emailContacto = t.emailIngest
      ? {
          nombre: t.emailIngest.contacto?.nombre ?? "",
          email: t.emailIngest.contacto?.email ?? t.emailIngest.recipientEmail,
        }
      : null;
    // Cuerpo del email. Solo se expone a admin — los finders del portal no
    // ven el contenido de la correspondencia, solo metadatos.
    const emailBody =
      t.emailIngest && opts.scope === "admin" ? t.emailIngest.body : null;

    // Actor:
    //  - Email ingerido → el socio (Alberto/Gabriel) dueño del buzón: quien
    //    envió el saliente / recibió el entrante. Se resuelve por `upn`.
    //  - Calendar ingerido → "Sistema (cron)" (una reunión es bidireccional).
    //  - Manual → asignado primero (quien la tenía), sino autor.
    let actor: TimelineActor;
    if (t.emailIngest) {
      const socio = userByEmail.get(t.emailIngest.upn.toLowerCase());
      actor = socio
        ? { kind: "admin", id: socio.id, name: socio.name }
        : { kind: "system", id: null, name: "Sistema (cron)" };
    } else if (t.calendarIngest) {
      actor = { kind: "system", id: null, name: "Sistema (cron)" };
    } else {
      actor = actorFromAuthors(
        t.asignado ?? t.autor,
        t.asignadoFinder ?? t.autorFinder
      );
    }

    return {
      kind: "tarea_completada",
      id: `tarea-${t.id}`,
      fecha: (t.completadaAt ?? t.createdAt).toISOString(),
      actor,
      density: "full",
      payload: {
        tareaId: t.id,
        tipo: t.tipo,
        titulo: t.titulo,
        resultado: t.resultado,
        source,
        emailDirection,
        emailContacto,
        emailBody,
      },
    };
  });
}

async function loadCrmLogs(empresaId: number): Promise<TimelineEvent[]> {
  const logs = await prisma.crmLog.findMany({
    where: { empresaId },
    select: {
      id: true,
      event: true,
      fromStage: true,
      toStage: true,
      note: true,
      createdAt: true,
      autor: { select: { id: true, name: true } },
      autorFinder: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Solo cambios de stage (event = "stage_changed", "new_deal", "removed_from_funnel").
  // No filtramos por event aquí — son los tres "públicos" y todos cuentan.
  return logs.map<TimelineEvent>((l) => ({
    kind: "stage_changed",
    id: `crmlog-${l.id}`,
    fecha: l.createdAt.toISOString(),
    actor: actorFromAuthors(l.autor, l.autorFinder),
    density: "compact",
    payload: {
      from: l.fromStage,
      to: l.toStage,
      note: l.note,
    },
  }));
}

async function loadBormes(empresaId: number): Promise<TimelineEvent[]> {
  const bormes = await prisma.bormeAlerta.findMany({
    where: { empresaId },
    select: {
      id: true,
      fecha: true,
      tipoActo: true,
      descripcion: true,
      urlBorme: true,
      personaDetectada: true,
      grupoInferido: { select: { nombre: true } },
    },
    orderBy: { fecha: "desc" },
  });

  return bormes.map<TimelineEvent>((b) => ({
    kind: "borme",
    id: `borme-${b.id}`,
    fecha: b.fecha.toISOString(),
    actor: { kind: "system", id: null, name: "BORME" },
    density: "full",
    payload: {
      bormeAlertaId: b.id,
      tipoActo: b.tipoActo,
      descripcion: b.descripcion,
      urlBorme: b.urlBorme,
      grupoInferidoNombre: b.grupoInferido?.nombre ?? null,
      personaDetectada: b.personaDetectada,
    },
  }));
}

function actorFromAuthors(
  admin: { id: string; name: string } | null | undefined,
  finder: { id: string; name: string } | null | undefined
): TimelineActor {
  if (admin) return { kind: "admin", id: admin.id, name: admin.name };
  if (finder) return { kind: "finder", id: finder.id, name: finder.name };
  return { kind: "system", id: null, name: "Sistema" };
}
