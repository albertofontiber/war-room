/**
 * Cliente Microsoft Graph para Calendars.Read sobre calendario primario.
 *
 * Lee eventos del calendario del UPN especificado, filtrados por
 * `lastModifiedDateTime` desde un cursor. Devuelve solo los campos que el
 * matcher necesita — NO el body del evento (privacy by design: si el evento
 * no matchea con un Contacto, no debe ni leerse el cuerpo).
 *
 * Filtramos por `lastModifiedDateTime` (no `start/dateTime`) porque queremos
 * capturar también re-schedules de eventos antiguos y cancelaciones — la
 * mutabilidad del calendario es la diferencia clave vs SentItems (inmutables).
 *
 * Permission `Calendars.Read` está limitado a `alberto@` y `gabriel@` vía la
 * misma Application Access Policy de Exchange Online que gobierna Mail.Read
 * (la policy aplica a TODO el contenido del buzón: mail + calendar + contacts).
 * Documentado en `setup-graph-calendar.md`.
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
};

const SELECT_FIELDS =
  "id,iCalUId,subject,isCancelled,isOnlineMeeting,start,end,lastModifiedDateTime,organizer,attendees";

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
