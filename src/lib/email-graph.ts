/**
 * Cliente Microsoft Graph para Mail.Read sobre el buzón de un usuario.
 *
 * Lee la carpeta "Enviados" (emails salientes, filtro `sentDateTime`) y el
 * buzón completo para los recibidos (emails entrantes, filtro
 * `receivedDateTime`, todas las carpetas) de un usuario (UPN) desde un
 * cursor. Devuelve solo los campos que el matcher necesita —
 * NO el body de los emails (privacy by design: el server descarta cualquier
 * cosa que no matchee con un Contacto, así que no debe ni leer el cuerpo).
 *
 * Permission Mail.Read está limitado a `alberto@` y `gabriel@` vía
 * Application Access Policy en Exchange Online. Si la policy se desactiva
 * por error, Graph devolverá los mensajes del UPN solicitado igualmente —
 * la policy es la única defensa server-side contra leer otros buzones.
 */

import { graphFetch } from "@/lib/graph-auth";

export type SentItemRecipient = {
  emailAddress: { name: string | null; address: string };
};

export type SentItem = {
  id: string;
  internetMessageId: string;
  subject: string | null;
  sentDateTime: string; // ISO 8601 UTC
  toRecipients: SentItemRecipient[];
  ccRecipients: SentItemRecipient[];
  bccRecipients: SentItemRecipient[];
  // Graph anota el tipo OData solo en instancias de tipos derivados. Para un
  // email normal viene ausente; para invitaciones / respuestas de reunión
  // viene como `#microsoft.graph.eventMessage*`.
  "@odata.type"?: string;
};

const SELECT_FIELDS =
  "id,internetMessageId,subject,sentDateTime,toRecipients,ccRecipients,bccRecipients";

/**
 * True si el mensaje es una invitación o respuesta de reunión
 * (`eventMessage` / `eventMessageRequest` / `eventMessageResponse`) — no un
 * email normal. Estos no van al timeline de email: la reunión la captura el
 * pipeline de calendario. Filtrarlos evita ruido tipo "Accepted: ..." /
 * "Meeting: ..." en la ficha del CRM.
 */
function isMeetingMessage(item: { "@odata.type"?: string }): boolean {
  const t = item["@odata.type"];
  return typeof t === "string" && t.toLowerCase().includes("eventmessage");
}

/**
 * Lista emails enviados desde `upn` con `sentDateTime > since`. Pagina
 * automáticamente. Orden cronológico ascendente para que el cursor avance
 * monotónicamente; si el cron falla a medio camino, la siguiente ronda
 * reanuda desde el último procesado.
 *
 * Nota: Graph filter usa formato ISO 8601 sin tz (z suffix → "Z").
 */
export async function listSentItemsSince(
  upn: string,
  since: Date
): Promise<SentItem[]> {
  const isoSince = since.toISOString(); // "2026-05-07T18:00:00.000Z"
  const filter = encodeURIComponent(`sentDateTime gt ${isoSince}`);
  const orderby = encodeURIComponent("sentDateTime asc");
  let nextUrl: string | null =
    `/users/${encodeURIComponent(upn)}/mailFolders/SentItems/messages` +
    `?$select=${SELECT_FIELDS}&$filter=${filter}&$orderby=${orderby}&$top=50`;

  const all: SentItem[] = [];
  while (nextUrl) {
    type GraphResponse = {
      value: SentItem[];
      "@odata.nextLink"?: string;
    };
    const json: GraphResponse = await graphFetch(nextUrl);
    all.push(...json.value);
    nextUrl = json["@odata.nextLink"] ?? null;
  }
  // Excluye invitaciones / respuestas de reunión — son ruido en el timeline
  // de email; la reunión la captura el pipeline de calendario.
  return all.filter((m) => !isMeetingMessage(m));
}

/** Extrae los emails (lowercased) de los campos to/cc/bcc de un SentItem. */
export function recipientsOf(item: SentItem): string[] {
  const all = [...item.toRecipients, ...item.ccRecipients, ...item.bccRecipients];
  const uniq = new Set<string>();
  for (const r of all) {
    const addr = r.emailAddress?.address;
    if (addr) uniq.add(addr.toLowerCase());
  }
  return Array.from(uniq);
}

// ─── Mensajes recibidos (emails entrantes) ─────────────────────────────────

export type ReceivedMessage = {
  id: string;
  internetMessageId: string;
  subject: string | null;
  receivedDateTime: string; // ISO 8601 UTC
  from: { emailAddress: { name: string | null; address: string } } | null;
  // Ver nota en SentItem: presente solo en respuestas/invitaciones de reunión.
  "@odata.type"?: string;
};

const RECEIVED_SELECT_FIELDS =
  "id,internetMessageId,subject,receivedDateTime,from";

/**
 * Lista mensajes del buzón de `upn` con `receivedDateTime > since`.
 *
 * Escanea `/users/{upn}/messages` — TODO el buzón, todas las carpetas — no
 * solo la Inbox. Mucha gente archiva el correo en subcarpetas; un scan de
 * Inbox a secas perdería casi toda la correspondencia entrante (fallo
 * silencioso). El precio es que `/messages` incluye también los enviados y
 * borradores: el caller los descarta filtrando por remitente (`senderOf` +
 * dominio externo), así que solo los emails realmente recibidos de un
 * contacto producen tarea.
 *
 * `opts.fromEmails` (opcional): si se pasa, filtra server-side por remitente
 * — imprescindible para el backfill histórico (una ventana de meses sobre
 * todo el buzón devolvería miles de mensajes). El cron en vivo NO lo necesita:
 * su ventana es de minutos, así que `/messages` devuelve pocos y filtra en
 * memoria.
 *
 * Pagina automáticamente y ordena cronológicamente en memoria (no usamos
 * `$orderby` porque Graph lo rechaza combinado con un `$filter` con `or`).
 */
export async function listReceivedMessagesSince(
  upn: string,
  since: Date,
  opts: { fromEmails?: string[] } = {}
): Promise<ReceivedMessage[]> {
  const isoSince = since.toISOString();
  const clauses = [`receivedDateTime gt ${isoSince}`];
  if (opts.fromEmails && opts.fromEmails.length > 0) {
    const ors = opts.fromEmails
      .map(
        (e) => `from/emailAddress/address eq '${e.replace(/'/g, "''")}'`
      )
      .join(" or ");
    clauses.push(`(${ors})`);
  }
  const filter = encodeURIComponent(clauses.join(" and "));
  let nextUrl: string | null =
    `/users/${encodeURIComponent(upn)}/messages` +
    `?$select=${RECEIVED_SELECT_FIELDS}&$filter=${filter}&$top=50`;

  const all: ReceivedMessage[] = [];
  while (nextUrl) {
    type GraphResponse = {
      value: ReceivedMessage[];
      "@odata.nextLink"?: string;
    };
    const json: GraphResponse = await graphFetch(nextUrl);
    all.push(...json.value);
    nextUrl = json["@odata.nextLink"] ?? null;
  }
  // Excluye respuestas / invitaciones de reunión (ruido — la reunión la
  // captura el pipeline de calendario) y ordena cronológicamente ascendente
  // (ISO 8601 ordena lexicográficamente bien).
  return all
    .filter((m) => !isMeetingMessage(m))
    .sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
}

/** Extrae el email del remitente (lowercased) de un ReceivedMessage, o null. */
export function senderOf(item: ReceivedMessage): string | null {
  const addr = item.from?.emailAddress?.address;
  return addr ? addr.toLowerCase() : null;
}

// ─── Cuerpo del email ──────────────────────────────────────────────────────

/**
 * Cap defensivo del cuerpo almacenado (en chars). Un email normal, incluso con
 * hilo citado largo, no se acerca; protege de reenvíos patológicos.
 */
const BODY_MAX_CHARS = 100_000;

/**
 * Strip básico de HTML a texto. Solo se usa como defensa por si Graph ignora
 * el `Prefer: outlook.body-content-type="text"` y devuelve HTML igualmente.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type GraphBody = { contentType: string; content: string } | null | undefined;

/**
 * Normaliza el `body` de un mensaje Graph a texto plano listo para guardar.
 * Devuelve null si no hay contenido. Capa el resultado a `BODY_MAX_CHARS`.
 */
export function bodyToPlainText(body: GraphBody): string | null {
  if (!body || !body.content) return null;
  const raw =
    body.contentType?.toLowerCase() === "html"
      ? stripHtml(body.content)
      : body.content.trim();
  if (raw.length === 0) return null;
  return raw.length > BODY_MAX_CHARS
    ? raw.slice(0, BODY_MAX_CHARS) + "\n\n…[cuerpo truncado]"
    : raw;
}

/**
 * Trae el cuerpo de un mensaje concreto en texto plano. Se llama SOLO para los
 * emails que matchean un Contacto (privacy: no leemos el cuerpo del correo que
 * no entra al CRM). Best-effort: si Graph falla — mensaje movido/borrado entre
 * el scan y esta llamada, error transitorio — devuelve null y la tarea se crea
 * igual, sin cuerpo.
 *
 * `Prefer: outlook.body-content-type="text"` hace que Graph convierta el HTML
 * a texto en su lado — mucho más limpio que un strip casero.
 */
export async function getMessageBody(
  upn: string,
  messageId: string
): Promise<string | null> {
  try {
    const json = await graphFetch<{ body?: GraphBody }>(
      `/users/${encodeURIComponent(upn)}/messages/${encodeURIComponent(
        messageId
      )}?$select=body`,
      { headers: { Prefer: 'outlook.body-content-type="text"' } }
    );
    return bodyToPlainText(json.body);
  } catch {
    return null;
  }
}
