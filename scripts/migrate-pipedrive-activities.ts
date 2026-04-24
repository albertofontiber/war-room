/**
 * scripts/migrate-pipedrive-activities.ts
 *
 * EJECUTADO 2026-04-24 — 210 actividades migradas a prod (138 emails, 54 llamadas,
 * 18 reuniones). Script idempotente: relanzarlo sólo importa actividades nuevas.
 * Útil si el cron Pipedrive sigue activo hasta el cut-over y se quieren traer los
 * nuevos activities mientras tanto.
 *
 * Migra el histórico de actividades de Pipedrive → tabla `Actividad` del War Room.
 *
 * Idempotente: usa `Actividad.pipedriveId` (unique) como clave. Correr 2 veces no duplica.
 *
 * Usage:
 *   # dry run (default — no escribe en BD)
 *   npx tsx scripts/migrate-pipedrive-activities.ts
 *
 *   # ejecución real
 *   npx tsx scripts/migrate-pipedrive-activities.ts --apply
 *
 *   # filtrar por tipo (solo llamadas + reuniones):
 *   ... --apply --types=call,meeting
 *
 * Mapping de tipos Pipedrive → nuestro enum TipoActividad:
 *   call             → llamada
 *   email            → email
 *   meeting / lunch  → reunion
 *   task / deadline  → nota (se registra como texto, no cuenta como actividad activa)
 *   otros (linkedin,
 *     whatsapp,…)    → nota (se preserva note + subject)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";

const API_KEY = process.env.PIPEDRIVE_API_KEY ?? "";
const BASE = "https://api.pipedrive.com/v1";

if (!API_KEY) {
  console.error("❌ PIPEDRIVE_API_KEY no está seteado. Aborta.");
  process.exit(1);
}

// ─── CLI flags ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const typesArg = args.find((a) => a.startsWith("--types="))?.split("=")[1];
const FILTER_TYPES = typesArg ? typesArg.split(",").map((s) => s.trim()) : null;

type PipedriveActivity = {
  id: number;
  type: string;          // "call"|"email"|"meeting"|"lunch"|"task"|"deadline"|...
  subject: string | null;
  note: string | null;
  done: boolean;
  add_time: string;      // ISO timestamp
  marked_as_done_time: string | null;
  due_date: string | null; // YYYY-MM-DD
  due_time: string | null; // HH:MM
  org_id: number | null;
  user_id: number | null;
  deal_id: number | null;
  person_id: number | null;
  public_description: string | null;
};

type PipedriveUser = {
  id: number;
  name: string;
  email: string;
};

// ─── Mapping Pipedrive type → TipoActividad War Room ────────────────────────
function mapTipo(pipedriveType: string): "llamada" | "email" | "reunion" | "nota" {
  switch (pipedriveType) {
    case "call":
      return "llamada";
    case "email":
      return "email";
    case "meeting":
    case "lunch":
      return "reunion";
    default:
      // linkedin, whatsapp, etc → nota (preserva subject + note)
      // "deadline" y "task" se filtran fuera más abajo (ver DROP_TYPES)
      return "nota";
  }
}

// Tipos Pipedrive que NO se migran (ruido, genéricos, no son actividad real)
const DROP_TYPES = new Set(["deadline", "task"]);

// ─── Limpiar HTML a texto plano preservando saltos ───────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")         // strip remaining tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/\n{3,}/g, "\n\n")      // collapse blank lines
    .replace(/[ \t]+\n/g, "\n")      // trim trailing spaces per line
    .trim();
}

// ─── Fetch con paginación ────────────────────────────────────────────────────
async function fetchAll<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  let start = 0;
  const LIMIT = 500;
  while (true) {
    const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}limit=${LIMIT}&start=${start}&api_token=${API_KEY}`;
    const res = await fetch(url).then((r) => r.json());
    if (!res.success || !Array.isArray(res.data)) break;
    all.push(...res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += LIMIT;
    process.stdout.write(`.`); // progress
  }
  return all;
}

async function main() {
  console.log(`\n🔧 Migración actividades Pipedrive → Actividad (War Room)`);
  console.log(`   Modo: ${APPLY ? "✅ APPLY (escribe en BD)" : "🔍 DRY RUN (no escribe)"}`);
  if (FILTER_TYPES) console.log(`   Filtro tipos: ${FILTER_TYPES.join(", ")}`);
  console.log();

  // 1. Cargar mapping orgId → empresaId (desde CrmEstado.pipedriveOrgId)
  console.log(`📥 Cargando mapping orgId → empresaId desde CrmEstado…`);
  const crmEstados = await prisma.crmEstado.findMany({
    where: { pipedriveOrgId: { not: null } },
    select: { empresaId: true, pipedriveOrgId: true },
  });
  const orgToEmpresa = new Map<number, number>();
  for (const c of crmEstados) {
    if (c.pipedriveOrgId) orgToEmpresa.set(Number(c.pipedriveOrgId), c.empresaId);
  }
  console.log(`   ${orgToEmpresa.size} empresas con pipedriveOrgId.`);

  // 2. Cargar actividades existentes (para idempotencia)
  const existingIds = new Set<string>(
    (
      await prisma.actividad.findMany({
        where: { pipedriveId: { not: null } },
        select: { pipedriveId: true },
      })
    )
      .map((a) => a.pipedriveId)
      .filter((x): x is string => !!x)
  );
  console.log(`   ${existingIds.size} actividades ya importadas (skip).`);

  // 3. Cargar usuarios Pipedrive para poblar autor
  console.log(`📥 Fetching usuarios Pipedrive…`);
  const users = await fetchAll<PipedriveUser>("/users");
  const userMap = new Map<number, string>();
  for (const u of users) userMap.set(u.id, u.name);
  console.log(`\n   ${users.length} usuarios.`);

  // 4. Fetch actividades
  console.log(`📥 Fetching actividades Pipedrive (puede tardar)…`);
  const activities = await fetchAll<PipedriveActivity>("/activities?user_id=0"); // user_id=0 = todos
  console.log(`\n   ${activities.length} actividades totales.`);

  // 5. Procesar y filtrar
  let matched = 0;
  let orphan = 0;     // sin orgId o org no vinculada
  let duplicated = 0; // ya importada
  let filtered = 0;   // filtrada por --types
  let dropped = 0;    // DROP_TYPES (deadlines, tasks)
  const byTipo: Record<string, number> = {};
  const toInsert: {
    empresaId: number;
    pipedriveId: string;
    tipo: string;
    texto: string | null;
    autor: string | null;
    fecha: Date;
  }[] = [];

  for (const a of activities) {
    if (DROP_TYPES.has(a.type)) {
      dropped++;
      continue;
    }
    if (FILTER_TYPES && !FILTER_TYPES.includes(a.type)) {
      filtered++;
      continue;
    }
    const pid = String(a.id);
    if (existingIds.has(pid)) {
      duplicated++;
      continue;
    }
    if (a.org_id == null) {
      orphan++;
      continue;
    }
    const empresaId = orgToEmpresa.get(a.org_id);
    if (!empresaId) {
      orphan++;
      continue;
    }

    const tipo = mapTipo(a.type);
    byTipo[tipo] = (byTipo[tipo] ?? 0) + 1;

    // Combinar subject + note + public_description. Limpiar HTML del note.
    const parts: string[] = [];
    if (a.subject?.trim()) parts.push(a.subject.trim());
    const noteClean = a.note ? stripHtml(a.note) : "";
    if (noteClean && noteClean !== a.subject?.trim()) parts.push(noteClean);
    const pubClean = a.public_description ? stripHtml(a.public_description) : "";
    if (pubClean && pubClean !== noteClean) parts.push(pubClean);
    // Si el tipo original era algo no-estándar (linkedin, whatsapp…) lo marcamos
    const rawType = a.type;
    if (tipo === "nota" && !["task", "deadline"].includes(rawType)) {
      parts.unshift(`[${rawType}]`);
    }
    const texto = parts.length ? parts.join("\n\n") : null;

    // Fecha: preferir marked_as_done_time si está; si no, due_date + due_time; si no, add_time
    let fecha: Date;
    if (a.marked_as_done_time) {
      fecha = new Date(a.marked_as_done_time);
    } else if (a.due_date) {
      const t = a.due_time || "09:00";
      fecha = new Date(`${a.due_date}T${t}:00`);
    } else {
      fecha = new Date(a.add_time);
    }
    if (isNaN(fecha.getTime())) fecha = new Date(a.add_time);

    const autor = a.user_id ? userMap.get(a.user_id) ?? null : null;

    toInsert.push({
      empresaId,
      pipedriveId: pid,
      tipo,
      texto,
      autor,
      fecha,
    });
    matched++;
  }

  console.log();
  console.log(`📊 Resumen:`);
  console.log(`   Total actividades Pipedrive:    ${activities.length}`);
  console.log(`   Descartadas (deadline/task):    ${dropped}`);
  console.log(`   Ya importadas (skip):           ${duplicated}`);
  console.log(`   Filtradas por --types:          ${filtered}`);
  console.log(`   Sin org vinculada (skip):       ${orphan}`);
  console.log(`   A insertar:                     ${matched}`);
  console.log();
  console.log(`   Por tipo:`);
  for (const [t, n] of Object.entries(byTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${t.padEnd(10)} ${n}`);
  }

  // Sample rows
  if (toInsert.length > 0) {
    console.log(`\n   Primeras 3 muestras:`);
    for (const s of toInsert.slice(0, 3)) {
      console.log(
        `     empresaId=${s.empresaId} ${s.tipo.padEnd(8)} ${s.fecha.toISOString().slice(0, 10)} autor=${s.autor ?? "–"} · ${(s.texto ?? "").slice(0, 60)}`
      );
    }
  }

  if (!APPLY) {
    console.log(`\n🔍 DRY RUN: nada escrito. Vuelve a lanzar con --apply para ejecutar.`);
    return;
  }

  // 6. Escribir en BD en batches
  console.log(`\n💾 Escribiendo ${matched} actividades en BD…`);
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const result = await prisma.actividad.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += result.count;
    process.stdout.write(`.`);
  }
  console.log(`\n✅ Insertadas ${inserted} actividades.`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
