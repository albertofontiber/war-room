/**
 * scripts/backfill-fecha-entrada-stage.ts
 *
 * Rellena `CrmEstado.fechaEntradaStage` usando `stage_change_time` del deal en
 * Pipedrive para las ~146 empresas donde este campo quedó null tras la migración
 * inicial. Se ejecuta ANTES del cut-over (aprovechando que Pipedrive aún responde).
 *
 * Idempotente: solo actualiza filas con fechaEntradaStage = null. No toca las
 * que ya tienen valor (backfill manual previo desde CrmLog).
 *
 * Usage:
 *   # dry run (default)
 *   npx tsx scripts/backfill-fecha-entrada-stage.ts
 *
 *   # ejecución real
 *   npx tsx scripts/backfill-fecha-entrada-stage.ts --apply
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";

const API_KEY = process.env.PIPEDRIVE_API_KEY ?? "";
const BASE = "https://api.pipedrive.com/v1";
const DEALFLOW_PIPELINE_ID = 1;

if (!API_KEY) { console.error("PIPEDRIVE_API_KEY not set"); process.exit(1); }

const APPLY = process.argv.includes("--apply");

type PipedriveDeal = {
  id: number;
  title: string;
  org_id: { value: number } | null;
  stage_id: number;
  stage_change_time: string | null;
  add_time: string;
  status: string;
};

async function fetchAllDeals(): Promise<PipedriveDeal[]> {
  const all: PipedriveDeal[] = [];
  let start = 0;
  while (true) {
    const url = `${BASE}/deals?pipeline_id=${DEALFLOW_PIPELINE_ID}&status=all_not_deleted&limit=500&start=${start}&api_token=${API_KEY}`;
    const res = await fetch(url).then((r) => r.json());
    if (!res.success || !Array.isArray(res.data)) break;
    all.push(...res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  return all;
}

async function main() {
  console.log(`\n🔧 Backfill CrmEstado.fechaEntradaStage desde Pipedrive stage_change_time`);
  console.log(`   Modo: ${APPLY ? "✅ APPLY" : "🔍 DRY RUN"}\n`);

  // 1. Empresas con pipedriveOrgId + fechaEntradaStage=null
  const candidatos = await prisma.crmEstado.findMany({
    where: {
      pipedriveOrgId: { not: null },
      fechaEntradaStage: null,
    },
    select: {
      empresaId: true,
      pipedriveOrgId: true,
      dealStage: true,
      updatedAt: true,
      empresa: { select: { nombre: true } },
    },
  });
  console.log(`   Candidatos (fechaEntradaStage null): ${candidatos.length}`);

  // 2. Fetch deals
  console.log(`📥 Fetching deals Dealflow de Pipedrive…`);
  const deals = await fetchAllDeals();
  console.log(`   ${deals.length} deals en Dealflow.`);

  // Index por org_id → deal
  const dealByOrg = new Map<number, PipedriveDeal>();
  for (const d of deals) {
    if (d.org_id?.value) {
      const existing = dealByOrg.get(d.org_id.value);
      // si hay varios deals por org, nos quedamos con el más reciente (mayor stage_change_time)
      if (
        !existing ||
        new Date(d.stage_change_time ?? d.add_time) >
          new Date(existing.stage_change_time ?? existing.add_time)
      ) {
        dealByOrg.set(d.org_id.value, d);
      }
    }
  }

  // 3. Decidir updates
  type Update = {
    empresaId: number;
    empresaNombre: string;
    fecha: Date;
    source: "stage_change_time" | "add_time";
    dealStage: string;
  };
  const updates: Update[] = [];
  let skippedNoDeal = 0;
  let skippedNoTime = 0;

  for (const c of candidatos) {
    if (!c.pipedriveOrgId) continue;
    const deal = dealByOrg.get(Number(c.pipedriveOrgId));
    if (!deal) {
      skippedNoDeal++;
      continue;
    }
    const raw = deal.stage_change_time ?? deal.add_time;
    if (!raw) {
      skippedNoTime++;
      continue;
    }
    const fecha = new Date(raw);
    if (isNaN(fecha.getTime())) {
      skippedNoTime++;
      continue;
    }
    updates.push({
      empresaId: c.empresaId,
      empresaNombre: c.empresa.nombre,
      fecha,
      source: deal.stage_change_time ? "stage_change_time" : "add_time",
      dealStage: c.dealStage ?? "?",
    });
  }

  console.log();
  console.log(`📊 Resumen:`);
  console.log(`   Candidatos:                 ${candidatos.length}`);
  console.log(`   Sin deal en Dealflow (skip): ${skippedNoDeal}`);
  console.log(`   Sin fecha utilizable (skip): ${skippedNoTime}`);
  console.log(`   A actualizar:                ${updates.length}`);
  console.log();

  // Distribución por source
  const sourceCount = updates.reduce<Record<string, number>>((acc, u) => {
    acc[u.source] = (acc[u.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`   Por source:`);
  for (const [s, n] of Object.entries(sourceCount)) console.log(`     ${s.padEnd(18)} ${n}`);

  // Distribución por antigüedad
  const now = Date.now();
  const buckets = { "0-30d": 0, "31-90d": 0, "91-180d": 0, "181-365d": 0, ">365d": 0 };
  for (const u of updates) {
    const dias = Math.floor((now - u.fecha.getTime()) / 86400000);
    if (dias <= 30) buckets["0-30d"]++;
    else if (dias <= 90) buckets["31-90d"]++;
    else if (dias <= 180) buckets["91-180d"]++;
    else if (dias <= 365) buckets["181-365d"]++;
    else buckets[">365d"]++;
  }
  console.log(`\n   Antigüedad (días en stage actual tras backfill):`);
  for (const [k, v] of Object.entries(buckets)) console.log(`     ${k.padEnd(12)} ${v}`);

  // Muestras
  console.log(`\n   Primeras 5 muestras:`);
  for (const u of updates.slice(0, 5)) {
    const dias = Math.floor((now - u.fecha.getTime()) / 86400000);
    console.log(`     empresa=${u.empresaNombre.padEnd(40).slice(0, 40)} stage=${u.dealStage.padEnd(16)} fecha=${u.fecha.toISOString().slice(0, 10)} (hace ${dias}d)`);
  }

  if (!APPLY) {
    console.log(`\n🔍 DRY RUN: nada escrito. Lanza con --apply para ejecutar.`);
    return;
  }

  // 4. Aplicar
  console.log(`\n💾 Actualizando ${updates.length} filas…`);
  let ok = 0;
  for (const u of updates) {
    await prisma.crmEstado.update({
      where: { empresaId: u.empresaId },
      data: { fechaEntradaStage: u.fecha },
    });
    ok++;
    if (ok % 25 === 0) process.stdout.write(".");
  }
  console.log(`\n✅ ${ok} actualizadas.`);
}

main()
  .catch((err) => { console.error("❌", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
