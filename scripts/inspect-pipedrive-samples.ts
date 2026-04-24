/**
 * scripts/inspect-pipedrive-samples.ts
 *
 * Pulls 10 diverse activities (mix tipos) and prints:
 *   - raw Pipedrive fields
 *   - cómo quedarían en la tabla `Actividad` del War Room
 *
 * Solo lectura. No escribe en BD.
 *
 * Usage: npx tsx scripts/inspect-pipedrive-samples.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";

const API_KEY = process.env.PIPEDRIVE_API_KEY ?? "";
const BASE = "https://api.pipedrive.com/v1";

if (!API_KEY) { console.error("PIPEDRIVE_API_KEY not set"); process.exit(1); }

function mapTipo(t: string) {
  switch (t) {
    case "call": return "llamada";
    case "email": return "email";
    case "meeting":
    case "lunch": return "reunion";
    default: return "nota";
  }
}

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
  }
  return all;
}

async function main() {
  const crmEstados = await prisma.crmEstado.findMany({
    where: { pipedriveOrgId: { not: null } },
    select: { empresaId: true, pipedriveOrgId: true, empresa: { select: { nombre: true } } },
  });
  const orgToEmpresa = new Map<number, { id: number; nombre: string }>();
  for (const c of crmEstados) {
    if (c.pipedriveOrgId) orgToEmpresa.set(Number(c.pipedriveOrgId), { id: c.empresaId, nombre: c.empresa.nombre });
  }

  const users = await fetchAll<{ id: number; name: string }>("/users");
  const userMap = new Map<number, string>();
  for (const u of users) userMap.set(u.id, u.name);

  const activities = await fetchAll<Record<string, unknown>>("/activities?user_id=0");

  const pickByTipo: Record<string, Record<string, unknown>[]> = {};
  for (const a of activities) {
    if (!a.org_id || !orgToEmpresa.has(a.org_id as number)) continue;
    const tipo = mapTipo(a.type as string);
    pickByTipo[tipo] = pickByTipo[tipo] ?? [];
    if (pickByTipo[tipo].length < 3) pickByTipo[tipo].push(a);
  }

  console.log(`\n📋 Muestras por tipo\n`);
  for (const [tipo, arr] of Object.entries(pickByTipo)) {
    console.log(`\n── ${tipo.toUpperCase()} (${arr.length} muestras) ──────────────────\n`);
    for (const a of arr) {
      const emp = orgToEmpresa.get(a.org_id as number);
      const autor = a.user_id ? userMap.get(a.user_id as number) ?? null : null;
      const parts: string[] = [];
      if ((a.subject as string)?.trim()) parts.push((a.subject as string).trim());
      if ((a.note as string)?.trim() && (a.note as string).trim() !== (a.subject as string)?.trim()) {
        parts.push((a.note as string).trim());
      }
      const rawType = a.type as string;
      if (tipo === "nota" && rawType !== "task" && rawType !== "deadline") {
        parts.unshift(`[${rawType}]`);
      }
      const texto = parts.join("\n\n");

      let fecha: Date;
      if (a.marked_as_done_time) {
        fecha = new Date(a.marked_as_done_time as string);
      } else if (a.due_date) {
        const t = (a.due_time as string) || "09:00";
        fecha = new Date(`${a.due_date}T${t}:00`);
      } else {
        fecha = new Date(a.add_time as string);
      }
      if (isNaN(fecha.getTime())) fecha = new Date(a.add_time as string);

      console.log(`PIPEDRIVE RAW:`);
      console.log(`  id=${a.id}  type=${a.type}  done=${a.done}`);
      console.log(`  subject=${JSON.stringify(a.subject)}`);
      console.log(`  note=${JSON.stringify((a.note as string)?.slice(0, 80) ?? null)}`);
      console.log(`  add_time=${a.add_time}  marked_as_done_time=${a.marked_as_done_time}  due_date=${a.due_date}`);
      console.log(`  user_id=${a.user_id} (${autor ?? "–"})  org_id=${a.org_id}`);

      console.log(`\nWAR ROOM (Actividad):`);
      console.log(`  empresaId: ${emp?.id}  (${emp?.nombre})`);
      console.log(`  tipo:      ${tipo}`);
      console.log(`  fecha:     ${fecha.toISOString()}`);
      console.log(`  autor:     ${autor ?? "–"}`);
      console.log(`  pipedriveId: ${a.id}`);
      console.log(`  texto:`);
      console.log(texto.split("\n").map((l) => `    ${l}`).join("\n"));
      console.log(`  ${"─".repeat(40)}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
