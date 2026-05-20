/**
 * scripts/backfill-email-tasks.ts
 *
 * Backfill histórico de emails → Tareas tipo `email` matcheando contra los
 * `Contacto` existentes en BD. Pensado para correr una sola vez tras el import
 * masivo de contactos (2026-05-19) y popular el timeline desde Enero 2026.
 *
 * Procesa dos flujos de cada buzón:
 *   - SentItems (salientes): emails que enviamos al contacto.
 *   - `/messages` (entrantes): emails recibidos del contacto, escaneando todo
 *     el buzón (todas las carpetas) — no solo Inbox. Para no traer meses de
 *     buzón entero, filtra server-side por remitente = los Contacto en BD.
 *
 * Cursores:
 *   - NO toca `EmailIngestCursor.lastSentDateTime` — ese cursor lo controla el
 *     cron real-time de salientes (cada ~15 min, vivo desde 2026-05-09).
 *   - SÍ siembra `EmailIngestCursor.lastReceivedDateTime` al aplicar: la
 *     ingesta de entrantes es nueva, no había cursor. Lo dejamos en la fecha
 *     del último email procesado para que el cron continúe sin gap cuando se
 *     despliegue.
 *
 * Dedup por `EmailIngest.internetMessageId` (@unique). Si un email ya fue
 * ingerido por el cron, se salta limpio. Idempotente: re-ejecutar no duplica.
 *
 * Patrón de matching clonado de `src/lib/email-task-matcher.ts` para no
 * acoplar este script de un solo uso al cron de prod.
 *
 * Usage:
 *   npx tsx scripts/backfill-email-tasks.ts                  (dry-run)
 *   APPLY=1 npx tsx scripts/backfill-email-tasks.ts          (aplica)
 *   SINCE=2026-03-01 npx tsx scripts/backfill-email-tasks.ts (custom desde)
 *   UPN=alberto@fontiber.com npx tsx scripts/...             (solo un UPN)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";
import {
  listSentItemsSince,
  listReceivedMessagesSince,
  recipientsOf,
  senderOf,
  type SentItem,
} from "../src/lib/email-graph";
import { auditLog } from "../src/lib/audit-log";

const APPLY = process.env.APPLY === "1";
const SINCE = new Date(process.env.SINCE ?? "2026-01-01T00:00:00Z");
const FONTIBER_DOMAIN = "fontiber.com";

type Direction = "saliente" | "entrante";

function getUpns(): string[] {
  if (process.env.UPN) return [process.env.UPN];
  const raw =
    process.env.EMAIL_TASK_OWNER_UPNS ??
    "alberto@fontiber.com,gabriel@fontiber.com";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isExternal(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1) !== FONTIBER_DOMAIN;
}

function externalRecipients(item: SentItem): string[] {
  return recipientsOf(item).filter(isExternal);
}

interface EmailEssentials {
  internetMessageId: string;
  subject: string;
  occurredAt: Date;
  counterpartyEmails: string[];
  direction: Direction;
}

interface PlannedTarea {
  upn: string;
  direction: Direction;
  internetMessageId: string;
  occurredAt: Date;
  subject: string;
  contactoEmail: string;
  contactoNombre: string;
  empresaId: number;
  empresaNombre: string;
}

interface Stats {
  upn: string;
  sentFetched: number;
  receivedFetched: number;
  internalOrEmpty: number;
  alreadyIngested: number;
  noMatch: number;
  toCreateSaliente: number;
  toCreateEntrante: number;
  created: number;
  errors: number;
}

/**
 * Procesa un email individual: dedup, match, y (si APPLY) creación atómica.
 * Acumula en `stats` y `planned`.
 */
async function ingestOne(
  e: EmailEssentials,
  upn: string,
  stats: Stats,
  planned: PlannedTarea[]
): Promise<void> {
  const existing = await prisma.emailIngest.findUnique({
    where: { internetMessageId: e.internetMessageId },
    select: { id: true },
  });
  if (existing) {
    stats.alreadyIngested++;
    return;
  }
  if (e.counterpartyEmails.length === 0) {
    stats.internalOrEmpty++;
    return;
  }

  const contactos = await prisma.contacto.findMany({
    where: { email: { in: e.counterpartyEmails } },
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
    return;
  }

  const c = contactos[0];
  planned.push({
    upn,
    direction: e.direction,
    internetMessageId: e.internetMessageId,
    occurredAt: e.occurredAt,
    subject: e.subject,
    contactoEmail: c.email ?? "",
    contactoNombre: c.nombre,
    empresaId: c.empresaId,
    empresaNombre: c.empresa.nombre,
  });
  if (e.direction === "saliente") stats.toCreateSaliente++;
  else stats.toCreateEntrante++;

  if (!APPLY) return;

  const titulo = (e.subject.length > 0 ? e.subject : "(sin asunto)").slice(0, 255);
  const verbo = e.direction === "entrante" ? "de" : "a";
  const descripcion = `Email ${verbo} ${c.nombre}${c.email ? ` <${c.email}>` : ""}`;
  const source = e.direction === "entrante" ? "graph-inbox" : "graph-sent-items";

  try {
    await prisma.$transaction(async (tx) => {
      const tarea = await tx.tarea.create({
        data: {
          empresaId: c.empresaId,
          tipo: "email",
          titulo,
          descripcion,
          completada: true,
          completadaAt: e.occurredAt,
          fechaLimite: e.occurredAt,
        },
      });
      await tx.emailIngest.create({
        data: {
          internetMessageId: e.internetMessageId,
          upn,
          direction: e.direction,
          recipientEmail: c.email ?? "",
          contactoId: c.id,
          empresaId: c.empresaId,
          tareaId: tarea.id,
          sentAt: e.occurredAt,
          subject: e.subject,
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
          direction: e.direction,
          titulo: tarea.titulo,
          source: `backfill-email-tasks/${source}`,
          upn,
          internetMessageId: e.internetMessageId,
        },
      });
    });
    stats.created++;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      // Race contra cron real-time. Tratamos como ya ingerido.
      stats.alreadyIngested++;
      if (e.direction === "saliente") stats.toCreateSaliente--;
      else stats.toCreateEntrante--;
    } else {
      console.error(`   ❌ Error en ${e.internetMessageId}:`, err);
      stats.errors++;
    }
  }
}

async function processUpn(
  upn: string,
  contactEmails: string[]
): Promise<{ stats: Stats; planned: PlannedTarea[] }> {
  const stats: Stats = {
    upn,
    sentFetched: 0,
    receivedFetched: 0,
    internalOrEmpty: 0,
    alreadyIngested: 0,
    noMatch: 0,
    toCreateSaliente: 0,
    toCreateEntrante: 0,
    created: 0,
    errors: 0,
  };
  const planned: PlannedTarea[] = [];

  // ─── Salientes ───────────────────────────────────────────────────────────
  console.log(`\n📤 [${upn}] Leyendo Enviados desde ${SINCE.toISOString()}…`);
  const sentItems = await listSentItemsSince(upn, SINCE);
  stats.sentFetched = sentItems.length;
  console.log(`   ${sentItems.length} emails enviados.`);
  for (const item of sentItems) {
    await ingestOne(
      {
        internetMessageId: item.internetMessageId,
        subject: item.subject ?? "",
        occurredAt: new Date(item.sentDateTime),
        counterpartyEmails: externalRecipients(item),
        direction: "saliente",
      },
      upn,
      stats,
      planned
    );
  }

  // ─── Entrantes ───────────────────────────────────────────────────────────
  // Escanea todo el buzón filtrando server-side por remitente = los contactos
  // en BD. Sin ese filtro, una ventana de meses sobre `/messages` traería
  // miles de mensajes irrelevantes.
  console.log(`📥 [${upn}] Leyendo recibidos (todo el buzón) desde ${SINCE.toISOString()}…`);
  const receivedItems = await listReceivedMessagesSince(upn, SINCE, {
    fromEmails: contactEmails,
  });
  stats.receivedFetched = receivedItems.length;
  console.log(`   ${receivedItems.length} emails recibidos de contactos.`);
  let maxReceived: Date | null = null;
  for (const item of receivedItems) {
    const sender = senderOf(item);
    const externalSender = sender && isExternal(sender) ? [sender] : [];
    await ingestOne(
      {
        internetMessageId: item.internetMessageId,
        subject: item.subject ?? "",
        occurredAt: new Date(item.receivedDateTime),
        counterpartyEmails: externalSender,
        direction: "entrante",
      },
      upn,
      stats,
      planned
    );
    maxReceived = new Date(item.receivedDateTime); // items en orden asc
  }

  // ─── Sembrar cursor de entrantes ─────────────────────────────────────────
  // Solo al aplicar. El cron de entrantes (cuando se despliegue) reanuda desde
  // aquí — `receivedDateTime gt lastReceivedDateTime` — sin gap ni duplicados.
  if (APPLY && maxReceived) {
    await prisma.emailIngestCursor.upsert({
      where: { upn },
      create: {
        upn,
        lastSentDateTime: SINCE, // defensivo: la fila ya existe en prod
        lastReceivedDateTime: maxReceived,
      },
      update: { lastReceivedDateTime: maxReceived },
    });
    console.log(
      `   🔖 Cursor lastReceivedDateTime sembrado: ${maxReceived.toISOString()}`
    );
  }

  return { stats, planned };
}

function printPlanBreakdown(planned: PlannedTarea[]): void {
  const byEmpresa = new Map<string, { sal: number; ent: number }>();
  for (const p of planned) {
    const e = byEmpresa.get(p.empresaNombre) ?? { sal: 0, ent: 0 };
    if (p.direction === "saliente") e.sal++;
    else e.ent++;
    byEmpresa.set(p.empresaNombre, e);
  }
  const sorted = [...byEmpresa.entries()].sort(
    (a, b) => b[1].sal + b[1].ent - (a[1].sal + a[1].ent)
  );
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Desglose por empresa (${planned.length} tareas · 📤 saliente / 📥 entrante):`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const [empresa, { sal, ent }] of sorted) {
    const total = (sal + ent).toString().padStart(4);
    console.log(`  ${total} · 📤 ${String(sal).padStart(3)} 📥 ${String(ent).padStart(3)} · ${empresa}`);
  }
}

/**
 * Aplica las columnas nuevas a la BD si no existen. Aditivo + idempotente
 * (`IF NOT EXISTS`). Las declara el schema Prisma; este ALTER las materializa
 * para que el script funcione aunque el deploy del cron aún no las haya
 * empujado. Postgres 11+ añade una columna NOT NULL con default constante
 * como operación de metadata (sin reescribir la tabla).
 */
async function ensureSchema(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "EmailIngest" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'saliente'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "EmailIngestCursor" ADD COLUMN IF NOT EXISTS "lastReceivedDateTime" TIMESTAMP(3)`
  );
}

async function main() {
  const upns = getUpns();

  // Emails de los contactos en BD — filtro server-side para los entrantes.
  const contactos = await prisma.contacto.findMany({
    where: { email: { not: null } },
    select: { email: true },
  });
  const contactEmails = Array.from(
    new Set(
      contactos
        .map((c) => c.email)
        .filter((e): e is string => !!e)
        .map((e) => e.toLowerCase())
    )
  );
  if (contactEmails.length === 0) {
    console.error("❌ No hay contactos con email en BD. Aborta.");
    process.exit(1);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Backfill email → tareas (${APPLY ? "APLICAR" : "DRY-RUN"})`);
  console.log(`  Desde: ${SINCE.toISOString()}`);
  console.log(`  UPNs:  ${upns.join(", ")}`);
  console.log(`  Contactos con email: ${contactEmails.length}`);
  console.log(`  Flujos: Enviados (saliente) + buzón completo (entrante)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (APPLY) {
    await ensureSchema();
    console.log("  ✔ Schema verificado (EmailIngest.direction, EmailIngestCursor.lastReceivedDateTime)");
  }

  const allStats: Stats[] = [];
  const allPlanned: PlannedTarea[] = [];

  for (const upn of upns) {
    try {
      const { stats, planned } = await processUpn(upn, contactEmails);
      allStats.push(stats);
      allPlanned.push(...planned);
    } catch (err) {
      console.error(`❌ Error procesando ${upn}:`, err);
      allStats.push({
        upn,
        sentFetched: 0,
        receivedFetched: 0,
        internalOrEmpty: 0,
        alreadyIngested: 0,
        noMatch: 0,
        toCreateSaliente: 0,
        toCreateEntrante: 0,
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
    console.log(`    enviados leídos:   ${s.sentFetched}`);
    console.log(`    recibidos leídos:  ${s.receivedFetched}`);
    console.log(`    interno / vacío:   ${s.internalOrEmpty}`);
    console.log(`    ya ingerido:       ${s.alreadyIngested}`);
    console.log(`    sin match:         ${s.noMatch}`);
    console.log(`    a crear saliente:  ${s.toCreateSaliente}`);
    console.log(`    a crear entrante:  ${s.toCreateEntrante}`);
    if (APPLY) {
      console.log(`    creadas:           ${s.created}`);
      console.log(`    errores:           ${s.errors}`);
    }
  }

  // Dedup cross-UPN por internetMessageId: un email a/de varios buzones
  // (ej. un contacto que escribe a alberto y a gabriel) aparece en los dos
  // scans. El APPLY solo crea una tarea (constraint @unique); el plan único
  // refleja esa cifra real.
  const planByMsgId = new Map<string, PlannedTarea>();
  let dupsAcrossUpn = 0;
  for (const p of allPlanned) {
    if (planByMsgId.has(p.internetMessageId)) dupsAcrossUpn++;
    else planByMsgId.set(p.internetMessageId, p);
  }
  const uniquePlanned = [...planByMsgId.values()];
  const totalSal = uniquePlanned.filter((p) => p.direction === "saliente").length;
  const totalEnt = uniquePlanned.filter((p) => p.direction === "entrante").length;

  if (!APPLY && uniquePlanned.length > 0) {
    if (dupsAcrossUpn > 0) {
      console.log(
        `\nℹ️  ${dupsAcrossUpn} emails compartidos entre buzones (mismo internetMessageId). Se cuentan 1 vez en el plan único.`
      );
    }
    printPlanBreakdown(uniquePlanned);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Muestra de las 12 primeras (orden cronológico):");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const sortedByDate = [...uniquePlanned].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
    );
    for (const p of sortedByDate.slice(0, 12)) {
      const dt = p.occurredAt.toISOString().slice(0, 16).replace("T", " ");
      const arrow = p.direction === "entrante" ? "📥" : "📤";
      const subj = (p.subject || "(sin asunto)").slice(0, 58);
      console.log(`  ${dt} ${arrow} ${p.empresaNombre} · ${p.contactoEmail}`);
      console.log(`            "${subj}"`);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (!APPLY) {
    console.log(
      `✅ DRY-RUN completado. Tareas únicas que se crearían: ${uniquePlanned.length} (📤 ${totalSal} · 📥 ${totalEnt})`
    );
    console.log(`   Para aplicar: APPLY=1 npx tsx scripts/backfill-email-tasks.ts`);
  } else {
    const totalCreated = allStats.reduce((a, s) => a + s.created, 0);
    const totalErrors = allStats.reduce((a, s) => a + s.errors, 0);
    console.log(`✅ Backfill aplicado. Tareas creadas: ${totalCreated}, errores: ${totalErrors}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
