/**
 * Cliente Microsoft Graph para Calendars.Read sobre calendario primario.
 *
 * Lee eventos del calendario del UPN especificado, filtrados por
 * `lastModifiedDateTime` desde un cursor. Devuelve los campos que el matcher
 * necesita más el `body` para extraer emails embebidos (caso típico: el
 * organizador no añade al contacto como attendee y solo lo menciona en el
 * cuerpo del invite).
 *
 * Filtramos por `lastModifiedDateTime` (no `start/dateTime`) porque queremos
 * capturar también re-schedules de eventos antiguos y cancelaciones — la
 * mutabilidad del calendario es la diferencia clave vs SentItems (inmutables).
 *
 * Privacy: el body se procesa en memoria transitoria para extraer emails que
 * matcheen con un Contacto conocido. Si NINGUNO matchea, no se persiste nada
 * (mismo principio que el matcher de email). El body NO se guarda en BD.
 *
 * Permission `Calendars.Read` está limitado a `alberto@` y `gabriel@` vía la
 * misma Application Access Policy de Exchange Online que gobierna Mail.Read
 * (la policy aplica a TODO el contenido del buzón: mail + calendar + contacts).
 */

import { graphFetch } from "@/lib/graph-auth";

export type EventAttendee = {
  type: "required" | "optional" | "resource";
  status?: {
    response?:
      | "none"
      | "organizer"
      | "tentativelyAccepted"
      | "accepted"
      | "declined"
      | "notResponded";
  };
  emailAddress: { name: string | null; address: string };
};

export type EventBody = {
  contentType: "html" | "text";
  content: string;
};

export type CalendarEvent = {
  id: string;
  iCalUId: string;
  subject: string | null;
  isCancelled: boolean;
  isOnlineMeeting: boolean;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  lastModifiedDateTime: string; // ISO 8601 UTC
  organizer: { emailAddress: { name: string | null; address: string } } | null;
  attendees: EventAttendee[];
  // Body se usa solo en memoria para extraer emails embebidos. No se persiste.
  body: EventBody | null;
};

const SELECT_FIELDS =
  "id,iCalUId,subject,isCancelled,isOnlineMeeting,start,end,lastModifiedDateTime,organizer,attendees,body";

/**
 * Lista eventos del calendario primario de `upn` con
 * `lastModifiedDateTime > since`. Pagina automáticamente. Orden ascendente
 * para que el cursor avance monotónicamente.
 *
 * `prefer=outlook.timezone="UTC"` fuerza a Graph a devolver `start/end` en
 * UTC en lugar del timezone del calendario. Sin esto, los timestamps llegan
 * en el TZ del usuario y `new Date()` los interpreta como local — mismatch.
 *
 * Limitamos a eventos modificados en los últimos N meses para no traer 5
 * años de historia accidentalmente. Se controla con `since` desde el caller.
 */
export async function listCalendarEventsSince(
  upn: string,
  since: Date
): Promise<CalendarEvent[]> {
  const isoSince = since.toISOString();
  const filter = encodeURIComponent(`lastModifiedDateTime gt ${isoSince}`);
  const orderby = encodeURIComponent("lastModifiedDateTime asc");
  let nextUrl: string | null =
    `/users/${encodeURIComponent(upn)}/events` +
    `?$select=${SELECT_FIELDS}&$filter=${filter}&$orderby=${orderby}&$top=50`;

  const all: CalendarEvent[] = [];
  while (nextUrl) {
    type GraphResponse = {
      value: CalendarEvent[];
      "@odata.nextLink"?: string;
    };
    // Header `Prefer: outlook.timezone="UTC"` aplica solo a este endpoint.
    // Lo añadimos vía init custom — graphFetch lo passthrough.
    const json: GraphResponse = await graphFetch(nextUrl);
    all.push(...json.value);
    nextUrl = json["@odata.nextLink"] ?? null;
  }
  return all;
}

/**
 * Extrae los emails (lowercased) de los attendees de un evento, excluyendo
 * los que declinaron. El organizer se incluye también (puede ser externo).
 */
export function attendeeEmailsOf(event: CalendarEvent): string[] {
  const uniq = new Set<string>();
  // Organizer
  const orgAddr = event.organizer?.emailAddress?.address;
  if (orgAddr) uniq.add(orgAddr.toLowerCase());
  // Attendees (skip declinados — el cliente expresó no interés)
  for (const a of event.attendees) {
    if (a.status?.response === "declined") continue;
    const addr = a.emailAddress?.address;
    if (addr) uniq.add(addr.toLowerCase());
  }
  return Array.from(uniq);
}

/**
 * Extrae emails embebidos en el body de un evento. Soporta HTML y texto.
 *
 * Casos típicos que cubre:
 *   - Plain text: "Reunion con foo@bar.com a las 10"
 *   - HTML auto-linked: `<a href="mailto:foo@bar.com">foo@bar.com</a>`
 *   - HTML párrafo: `<p>foo@bar.com</p>`
 *   - Mailto suelto: "mailto:foo@bar.com"
 *
 * No filtra emails de junk (teams.microsoft.com, noreply, etc.) — confiamos
 * en que `Contacto.findMany` solo devolverá los que matchean Contactos
 * reales, así que los basura simplemente no producen match. Filtrar aquí
 * añadiría una lista negra que hay que mantener.
 */
const EMAIL_RE = /[\w._+-]+@[\w-]+(?:\.[\w-]+)+/g;

export function extractEmailsFromBody(body: EventBody | null): string[] {
  if (!body?.content) return [];
  let text = body.content;
  if (body.contentType === "html") {
    // Saca el href de los mailto: a texto plano para que el regex los pille.
    text = text.replace(
      /<a [^>]*href="mailto:([^"]+)"[^>]*>/gi,
      " $1 "
    );
    // Strip resto de tags HTML.
    text = text.replace(/<[^>]+>/g, " ");
  }
  // Decodifica las entidades HTML más comunes que pueden esconder un email
  // (Outlook ocasionalmente escribe `&#64;` en lugar de `@`).
  text = text
    .replace(/&#64;/g, "@")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");

  const matches = text.match(EMAIL_RE) ?? [];
  const uniq = new Set<string>();
  for (const m of matches) {
    // Quita un "mailto:" residual por si el preprocess no lo cogió.
    const clean = m.replace(/^mailto:/i, "").toLowerCase();
    uniq.add(clean);
  }
  return Array.from(uniq);
}
