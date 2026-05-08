/**
 * Matcher de SentItems → Tareas.
 *
 * Para cada email enviado:
 *   1. Extrae recipients (To+CC+BCC), normalizados a lowercase.
 *   2. Filtra los que están en `@fontiber.com` (interno — no nos interesa
 *      auto-loguear emails entre admins).
 *   3. Busca matches en `Contacto.email` (también lowercased en BD por la
 *      validación zod del endpoint POST/PATCH de contactos).
 *   4. Por cada match, crea (idempotente) una Tarea + EmailIngest.
 *      Dedup por `internetMessageId` único.
 *
 * Privacy: los emails que NO matchean ningún Contacto no dejan rastro en BD.
 * Solo se persiste subject + recipientEmail + sentAt para los que sí entran.
 */

import { prisma } from "@/lib/prisma";
import { auditLog } from "@/lib/audit-log";
import { log } from "@/lib/logger";
import {
  listSentItemsSince,
  recipientsOf,
  type SentItem,
} from "@/lib/email-graph";

const FONTIBER_DOMAIN = "fontiber.com";

export type IngestStats = {
  upn: string;
  fetched: number;
  alreadyIngested: number;
  matched: number;
  noMatch: number;
  internalSkipped: number;
  tareasCreated: number;
  errors: number;
  newCursor: Date | null;
};

/** Filtra recipients @fontiber.com (descartamos emails internos). */
function externalRecipients(item: SentItem): string[] {
  return recipientsOf(item).filter((email) => {
    const at = email.lastIndexOf("@");
    if (at < 0) return false;
    const domain = email.slice(at + 1);
    return domain !== FONTIBER_DOMAIN;
  });
}

/**
 * Procesa un email individual. Si un recipient externo matchea con
 * `Contacto.email`, crea Tarea+EmailIngest atómicamente. Si hay varios
 * matches (raro: dos contactos con el mismo email), crea una tarea por
 * empresa distinta (un email a juan@x.com solo crea una tarea aunque haya
 * dos `Contacto` con ese email — usamos `findFirst` por simplicidad).
 *
 * Retorna `{ created: boolean, matched: boolean }`.
 */
async function ingestSentItem(
  item: SentItem,
  upn: string
): Promise<{ created: boolean; matched: boolean }> {
  // Dedup por internetMessageId. Si ya existe, salir sin tocar nada.
  const existing = await prisma.emailIngest.findUnique({
    where: { internetMessageId: item.internetMessageId },
    select: { id: true },
  });
  if (existing) return { created: false, matched: true };

  const externals = externalRecipients(item);
  if (externals.length === 0) return { created: false, matched: false };

  const contactos = await prisma.contacto.findMany({
    where: { email: { in: externals } },
    select: { id: true, email: true, empresaId: true, nombre: true },
  });
  if (contactos.length === 0) return { created: false, matched: false };

  const sentAt = new Date(item.sentDateTime);
  const subject = item.subject ?? "";

  // Una tarea por (empresa, messageId). Si hay dos contactos en la misma
  // empresa, una sola tarea. Si dos contactos en empresas distintas, dos
  // tareas (con el mismo internetMessageId — no se puede porque es @unique).
  // Resolución: una sola tarea contra el primer contacto encontrado.
  // Si en el futuro queremos taggear varias empresas, refactorizamos a
  // tabla N:M, pero hasta entonces asumimos 1 email = 1 empresa.
  const c = contactos[0];
  const titulo = subject.length > 0 ? subject : "(sin asunto)";
  const descripcion = `Email a ${c.nombre}${c.email ? ` <${c.email}>` : ""}`;

  try {
    await prisma.$transaction(async (tx) => {
      const tarea = await tx.tarea.create({
        data: {
          empresaId: c.empresaId,
          tipo: "email",
          titulo: titulo.slice(0, 255),
          descripcion,
          completada: true,
          completadaAt: sentAt,
          fechaLimite: sentAt,
        },
      });
      await tx.emailIngest.create({
        data: {
          internetMessageId: item.internetMessageId,
          upn,
          recipientEmail: c.email ?? "",
          contactoId: c.id,
          empresaId: c.empresaId,
          tareaId: tarea.id,
          sentAt,
          subject,
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
          titulo: tarea.titulo,
          source: "graph-sent-items",
          upn,
          internetMessageId: item.internetMessageId,
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
 * Procesa la carpeta SentItems de `upn` desde el cursor en BD. Actualiza el
 * cursor al final con el `sentDateTime` del último email procesado (sea que
 * matcheó o no, para no releer emails que ya descartamos por no tener
 * Contacto).
 *
 * Si es la primera vez (sin cursor), arranca desde "hace N minutos" para no
 * tragarse 5 años de Sent Items. `firstRunWindowMs` controla esa ventana
 * inicial — default 60 min para que el primer despliegue procese poco y
 * podamos verificar que funciona.
 */
export async function ingestUpn(
  upn: string,
  opts: { firstRunWindowMs?: number } = {}
): Promise<IngestStats> {
  const stats: IngestStats = {
    upn,
    fetched: 0,
    alreadyIngested: 0,
    matched: 0,
    noMatch: 0,
    internalSkipped: 0,
    tareasCreated: 0,
    errors: 0,
    newCursor: null,
  };

  const cursor = await prisma.emailIngestCursor.findUnique({ where: { upn } });
  const since =
    cursor?.lastSentDateTime ??
    new Date(Date.now() - (opts.firstRunWindowMs ?? 60 * 60 * 1000));

  let items: SentItem[];
  try {
    items = await listSentItemsSince(upn, since);
  } catch (err) {
    log.error("email-task-matcher:listSentItems", err, { upn });
    stats.errors++;
    return stats;
  }
  stats.fetched = items.length;

  let lastProcessed: Date | null = null;
  for (const item of items) {
    const externals = externalRecipients(item);
    if (externals.length === 0) {
      stats.internalSkipped++;
    }
    try {
      const { created, matched } = await ingestSentItem(item, upn);
      if (created) stats.tareasCreated++;
      if (matched && !created) stats.alreadyIngested++;
      if (matched) stats.matched++;
      else stats.noMatch++;
    } catch (err) {
      log.error("email-task-matcher:ingest", err, {
        upn,
        messageId: item.internetMessageId,
      });
      stats.errors++;
      // No avanzamos el cursor si falla un item: la próxima ronda lo reintenta.
      continue;
    }
    lastProcessed = new Date(item.sentDateTime);
  }

  if (lastProcessed) {
    await prisma.emailIngestCursor.upsert({
      where: { upn },
      create: { upn, lastSentDateTime: lastProcessed },
      update: { lastSentDateTime: lastProcessed },
    });
    stats.newCursor = lastProcessed;
  }

  return stats;
}

/** Test helper: expone funciones internas para los tests. */
export const __testing__ = {
  externalRecipients,
  ingestSentItem,
};
