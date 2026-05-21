/**
 * Matcher de emails → Tareas.
 *
 * Procesa dos flujos del buzón Graph de cada UPN:
 *   - SentItems (salientes): emails que nosotros enviamos al contacto.
 *   - `/messages`  (entrantes): emails recibidos del contacto, escaneando todo
 *     el buzón (todas las carpetas) — no solo Inbox, porque mucha gente
 *     archiva el correo en subcarpetas y un scan de Inbox a secas lo perdería.
 *
 * Para cada email:
 *   1. Determina el "contraparte" — el email externo relevante:
 *      · saliente → recipients To+CC+BCC.
 *      · entrante → remitente (from); los enviados que aparecen en el scan de
 *        `/messages` se descartan porque su remitente es interno.
 *   2. Filtra los `@fontiber.com` (interno — no auto-logueamos correo entre
 *      admins ni mail automático de Fontiber).
 *   3. Busca matches en `Contacto.email` (lowercased en BD por la validación
 *      zod del endpoint POST/PATCH de contactos).
 *   4. Por cada match, crea (idempotente) una Tarea + EmailIngest.
 *      Dedup por `internetMessageId` único.
 *
 * La Tarea lleva `tipo: "email"` y la dirección se refleja en `descripcion`
 * ("Email a X" vs "Email de X"); `EmailIngest.direction` la guarda explícita
 * para analítica. Todo email se registra como `completada: true` — es un
 * hecho histórico, no un to-do. La disciplina de tareas pendientes ("hay que
 * responder") es decisión humana, no se autogenera.
 *
 * Privacy: los emails que NO matchean ningún Contacto no dejan rastro en BD.
 * Solo se persiste subject + email del contacto + fecha para los que sí entran.
 */

import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import {
  listSentItemsSince,
  listReceivedMessagesSince,
  getMessageBody,
  recipientsOf,
  senderOf,
  type SentItem,
  type ReceivedMessage,
} from "@/lib/email-graph";

const FONTIBER_DOMAIN = "fontiber.com";

/** Ventana inicial cuando un cursor está vacío — procesa la última hora. */
const FIRST_RUN_WINDOW_MS = 60 * 60 * 1000;

export type EmailDirection = "saliente" | "entrante";

export type IngestStats = {
  upn: string;
  sentFetched: number;
  receivedFetched: number;
  alreadyIngested: number;
  matched: number;
  noMatch: number;
  internalSkipped: number;
  tareasCreated: number;
  errors: number;
  newSentCursor: Date | null;
  newReceivedCursor: Date | null;
};

/** True si el email es externo (no @fontiber.com) y tiene formato válido. */
function isExternal(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1) !== FONTIBER_DOMAIN;
}

/** Filtra recipients @fontiber.com de un email saliente (descartamos internos). */
function externalRecipients(item: SentItem): string[] {
  return recipientsOf(item).filter(isExternal);
}

/**
 * Núcleo común de ingesta. Dado un email (en cualquier dirección) ya reducido
 * a sus datos esenciales, dedup + match + creación atómica Tarea+EmailIngest.
 *
 * `counterpartyEmails` son los emails externos a matchear contra `Contacto`:
 * destinatarios si el email es saliente, remitente si es entrante.
 *
 * Retorna `{ created, matched }`. `matched` indica que el email corresponde a
 * un Contacto/EmailIngest conocido (aunque ya estuviera ingerido).
 */
async function ingestEmail(
  params: {
    graphId: string;
    internetMessageId: string;
    subject: string;
    occurredAt: Date;
    counterpartyEmails: string[];
    direction: EmailDirection;
  },
  upn: string
): Promise<{ created: boolean; matched: boolean }> {
  // Dedup por internetMessageId. Si ya existe, salir sin tocar nada.
  const existing = await prisma.emailIngest.findUnique({
    where: { internetMessageId: params.internetMessageId },
    select: { id: true },
  });
  if (existing) return { created: false, matched: true };

  if (params.counterpartyEmails.length === 0) {
    return { created: false, matched: false };
  }

  const contactos = await prisma.contacto.findMany({
    where: { email: { in: params.counterpartyEmails } },
    select: { id: true, email: true, empresaId: true, nombre: true },
  });
  if (contactos.length === 0) return { created: false, matched: false };

  // Una tarea por (empresa, messageId). Si hay dos contactos en la misma
  // empresa, una sola tarea. Si dos contactos en empresas distintas, no se
  // puede crear dos tareas con el mismo internetMessageId (es @unique):
  // usamos el primer contacto encontrado. Si en el futuro queremos taggear
  // varias empresas, refactorizamos a tabla N:M.
  const c = contactos[0];

  // Cuerpo del email — se pide SOLO ahora que sabemos que entra al CRM
  // (matchea Contacto). Best-effort: si Graph falla, la tarea se crea sin
  // cuerpo. La llamada va fuera de la transacción (es un fetch de red).
  const body = await getMessageBody(upn, params.graphId);

  const titulo = params.subject.length > 0 ? params.subject : "(sin asunto)";
  const verbo = params.direction === "entrante" ? "de" : "a";
  const descripcion = `Email ${verbo} ${c.nombre}${c.email ? ` <${c.email}>` : ""}`;
  const source =
    params.direction === "entrante" ? "graph-inbox" : "graph-sent-items";

  try {
    await prisma.$transaction(async (tx) => {
      const tarea = await tx.tarea.create({
        data: {
          empresaId: c.empresaId,
          tipo: "email",
          titulo: titulo.slice(0, 255),
          descripcion,
          completada: true,
          completadaAt: params.occurredAt,
          fechaLimite: params.occurredAt,
        },
      });
      await tx.emailIngest.create({
        data: {
          internetMessageId: params.internetMessageId,
          upn,
          direction: params.direction,
          recipientEmail: c.email ?? "",
          contactoId: c.id,
          empresaId: c.empresaId,
          tareaId: tarea.id,
          sentAt: params.occurredAt,
          subject: params.subject,
          body,
        },
      });
      void auditLog({
        actorType: "system",
        action: "create",
        entityType: "tarea",
        entityId: tarea.id,
        after: {
          empresaId: c.empresaId,
          tipo: "email",
          direction: params.direction,
          titulo: tarea.titulo,
          source,
          upn,
          internetMessageId: params.internetMessageId,
        },
      });
    });
    return { created: true, matched: true };
  } catch (err) {
    // Race: otro tick del cron procesó el mismo messageId. Constraint @unique
    // de internetMessageId revienta — está bien, lo tratamos como ya ingerido.
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { created: false, matched: true };
    }
    throw err;
  }
}

/**
 * Procesa un email saliente (SentItems). El contraparte son los recipients
 * externos To+CC+BCC.
 */
async function ingestSentItem(
  item: SentItem,
  upn: string
): Promise<{ created: boolean; matched: boolean }> {
  return ingestEmail(
    {
      graphId: item.id,
      internetMessageId: item.internetMessageId,
      subject: item.subject ?? "",
      occurredAt: new Date(item.sentDateTime),
      counterpartyEmails: externalRecipients(item),
      direction: "saliente",
    },
    upn
  );
}

/**
 * Procesa un email entrante. El contraparte es el remitente (from), si es
 * externo. Un email cuyo remitente es `@fontiber.com` (ej. alberto le escribe
 * a gabriel, un CC interno, o uno de nuestros propios enviados que aparece en
 * el scan de `/messages`) se descarta — no es actividad de un contacto.
 */
async function ingestReceivedMessage(
  item: ReceivedMessage,
  upn: string
): Promise<{ created: boolean; matched: boolean }> {
  const sender = senderOf(item);
  const externalSender = sender && isExternal(sender) ? [sender] : [];
  return ingestEmail(
    {
      graphId: item.id,
      internetMessageId: item.internetMessageId,
      subject: item.subject ?? "",
      occurredAt: new Date(item.receivedDateTime),
      counterpartyEmails: externalSender,
      direction: "entrante",
    },
    upn
  );
}

/** Acumula el resultado de un `ingestEmail` en las stats de la ronda. */
function applyResult(
  stats: IngestStats,
  result: { created: boolean; matched: boolean }
): void {
  if (result.created) stats.tareasCreated++;
  if (result.matched && !result.created) stats.alreadyIngested++;
  if (result.matched) stats.matched++;
  else stats.noMatch++;
}

/**
 * Procesa enviados + recibidos de `upn` desde el cursor en BD. Mantiene dos
 * cursores independientes (`lastSentDateTime` / `lastReceivedDateTime`) y los
 * actualiza con la fecha del último email procesado de cada flujo.
 *
 * Si una carpeta no tiene cursor todavía (primera vez), arranca desde "hace N
 * minutos" — `firstRunWindowMs`, default 60 min — para no tragarse años de
 * historia. El backfill histórico lo hace un script aparte (`scripts/`).
 */
export async function ingestUpn(
  upn: string,
  opts: { firstRunWindowMs?: number } = {}
): Promise<IngestStats> {
  const stats: IngestStats = {
    upn,
    sentFetched: 0,
    receivedFetched: 0,
    alreadyIngested: 0,
    matched: 0,
    noMatch: 0,
    internalSkipped: 0,
    tareasCreated: 0,
    errors: 0,
    newSentCursor: null,
    newReceivedCursor: null,
  };

  const windowMs = opts.firstRunWindowMs ?? FIRST_RUN_WINDOW_MS;
  const cursor = await prisma.emailIngestCursor.findUnique({ where: { upn } });

  // ─── Salientes (SentItems) ───────────────────────────────────────────────
  const sentSince =
    cursor?.lastSentDateTime ?? new Date(Date.now() - windowMs);
  let sentItems: SentItem[] = [];
  try {
    sentItems = await listSentItemsSince(upn, sentSince);
  } catch (err) {
    log.error("email-task-matcher:listSentItems", err, { upn });
    stats.errors++;
  }
  stats.sentFetched = sentItems.length;

  let lastSent: Date | null = null;
  for (const item of sentItems) {
    if (externalRecipients(item).length === 0) stats.internalSkipped++;
    try {
      applyResult(stats, await ingestSentItem(item, upn));
    } catch (err) {
      log.error("email-task-matcher:ingestSent", err, {
        upn,
        messageId: item.internetMessageId,
      });
      stats.errors++;
      continue; // No avanzamos el cursor si falla un item.
    }
    lastSent = new Date(item.sentDateTime);
  }

  // ─── Entrantes (todo el buzón) ───────────────────────────────────────────
  // La ventana del cron es de minutos, así que `/messages` devuelve pocos
  // mensajes y filtramos el remitente en memoria — sin filtro server-side.
  const recvSince =
    cursor?.lastReceivedDateTime ?? new Date(Date.now() - windowMs);
  let receivedItems: ReceivedMessage[] = [];
  try {
    receivedItems = await listReceivedMessagesSince(upn, recvSince);
  } catch (err) {
    log.error("email-task-matcher:listReceived", err, { upn });
    stats.errors++;
  }
  stats.receivedFetched = receivedItems.length;

  let lastReceived: Date | null = null;
  for (const item of receivedItems) {
    const sender = senderOf(item);
    if (!sender || !isExternal(sender)) stats.internalSkipped++;
    try {
      applyResult(stats, await ingestReceivedMessage(item, upn));
    } catch (err) {
      log.error("email-task-matcher:ingestReceived", err, {
        upn,
        messageId: item.internetMessageId,
      });
      stats.errors++;
      continue;
    }
    lastReceived = new Date(item.receivedDateTime);
  }

  // ─── Cursor ──────────────────────────────────────────────────────────────
  // Actualizamos solo los cursores cuya carpeta procesó algo. Si la fila no
  // existe (primer run), `lastSentDateTime` es obligatorio: usamos el último
  // procesado o, si no hubo ninguno, la ventana escaneada.
  if (lastSent || lastReceived) {
    await prisma.emailIngestCursor.upsert({
      where: { upn },
      create: {
        upn,
        lastSentDateTime: lastSent ?? sentSince,
        lastReceivedDateTime: lastReceived ?? recvSince,
      },
      update: {
        ...(lastSent ? { lastSentDateTime: lastSent } : {}),
        ...(lastReceived ? { lastReceivedDateTime: lastReceived } : {}),
      },
    });
    stats.newSentCursor = lastSent;
    stats.newReceivedCursor = lastReceived;
  }

  return stats;
}

/** Test helper: expone funciones internas para los tests. */
export const __testing__ = {
  isExternal,
  externalRecipients,
  ingestEmail,
  ingestSentItem,
  ingestReceivedMessage,
};
