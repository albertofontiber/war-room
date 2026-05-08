/**
 * Cliente Microsoft Graph para Mail.Read sobre carpeta SentItems.
 *
 * Lee la carpeta "Enviados" de un usuario (UPN) filtrado por `sentDateTime`
 * desde un cursor. Devuelve solo los campos que el matcher necesita —
 * NO el body de los emails (privacy by design: el server descarta cualquier
 * cosa que no matchee con un Contacto, así que no debe ni leer el cuerpo).
 *
 * Permission Mail.Read está limitado a `alberto@` y `gabriel@` vía
 * Application Access Policy en Exchange Online. Si la policy se desactiva
 * por error, Graph devolverá los SentItems del UPN solicitado igualmente —
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
};

const SELECT_FIELDS =
  "id,internetMessageId,subject,sentDateTime,toRecipients,ccRecipients,bccRecipients";

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
  return all;
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
