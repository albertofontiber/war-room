/**
 * scripts/pipedrive-sync.ts
 * Sincroniza los deals del pipeline "Dealflow" de Pipedrive → tabla CrmEstado en DB.
 *
 * Usage:
 *   npx tsx scripts/pipedrive-sync.ts
 *
 * Idempotente — seguro relanzar. Hace upsert de CrmEstado por empresaId.
 * Matching por nombre normalizado (misma lógica que BORME).
 */

import { prisma } from "../src/lib/prisma";
import { normalizeNombre } from "../src/lib/borme";

const API_KEY =
  process.env.PIPEDRIVE_API_KEY ?? "5dabb677eed66876bfbab960f678f98ca4e91b43";
const BASE = "https://api.pipedrive.com/v1";

// Pipeline "Dealflow"
const DEALFLOW_PIPELINE_ID = 1;

// Mapa stage_id → dealStage interno
const STAGE_MAP: Record<number, string> = {
  6: "identificado",    // Identificado
  7: "contactado",      // Contactado
  8: "primera_reunion", // 1ª reunión realizada
  9: "analisis",        // Análisis
  10: "LOI enviada",    // LOI enviada
  11: "execution",      // Ejecución
  12: "portfolio",      // Portfolio
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coreNombre(nombre: string): string {
  return nombre
    .replace(/\s*\(.*?\)\s*/g, " ")  // elimina sufijos entre paréntesis, ej: "(Prodein)"
    .replace(
      /\b(SOCIEDAD\s+ANONIMA|SOCIEDAD\s+LIMITADA|SOCIEDAD\s+LIMITADA\s+UNIPERSONAL|SOCIEDAD\s+ANONIMA\s+UNIPERSONAL)\b/g,
      ""
    )
    .replace(/\b(SAU|SLU|SLL|SRL|SCL|SLNE|SLP|AIE|UTE|CB|SC|SA|SL)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAllDeals(): Promise<any[]> {
  const all: any[] = [];
  let start = 0;

  while (true) {
    const url =
      `${BASE}/deals?pipeline_id=${DEALFLOW_PIPELINE_ID}` +
      `&status=all_not_deleted&limit=500&start=${start}` +
      `&api_token=${API_KEY}`;

    const res = await fetch(url).then((r) => r.json());

    if (!res.success || !Array.isArray(res.data)) break;
    all.push(...res.data);

    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }

  return all;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄  Pipedrive Sync — Dealflow\n");

  // 1. Cargar todas las empresas en memoria
  const empresas = await prisma.empresa.findMany({
    select: { id: true, nombre: true },
  });

  const nombreToId = new Map<string, number>();
  const coreToId = new Map<string, number>();

  for (const e of empresas) {
    const norm = normalizeNombre(e.nombre);
    const core = coreNombre(norm);
    nombreToId.set(norm, e.id);
    if (!coreToId.has(core)) coreToId.set(core, e.id);
  }

  console.log(`   Empresas en DB: ${empresas.length}`);

  // 2. Fetch deals de Pipedrive
  const deals = await fetchAllDeals();
  console.log(`   Deals en Pipedrive: ${deals.length}\n`);

  // 3a. Cargar mapa pipedriveOrgId → empresaId (para re-matches futuros)
  const existingCrm = await prisma.crmEstado.findMany({
    where: { pipedriveOrgId: { not: null } },
    select: { empresaId: true, pipedriveOrgId: true },
  });
  const orgIdToEmpresaId = new Map<string, number>();
  for (const c of existingCrm) {
    if (c.pipedriveOrgId) orgIdToEmpresaId.set(c.pipedriveOrgId, c.empresaId);
  }

  // 3b. Procesar cada deal
  let matched = 0;
  let skipped = 0;
  const unmatched: { title: string; orgName: string; stage: string }[] = [];

  for (const deal of deals) {
    const orgName: string = deal.org_name ?? deal.title ?? "";
    const orgId: number | null = deal.org_id?.value ?? null;
    const owner: string | null = deal.user_id?.name ?? null;

    // Determinar stage
    let dealStage: string;
    if (deal.status === "lost") {
      dealStage = "muerto";
    } else if (deal.status === "won") {
      dealStage = "portfolio";
    } else {
      dealStage = STAGE_MAP[deal.stage_id as number] ?? "prospecto";
    }

    // Match: 1) por pipedriveOrgId ya conocido, 2) por nombre normalizado
    const byOrgId = orgId != null ? orgIdToEmpresaId.get(String(orgId)) : null;
    // Limpiar sufijos entre paréntesis antes de normalizar, ej: "Prodein SL (Prodein)" → "Prodein SL"
    const orgNameClean = orgName.replace(/\s*\(.*?\)\s*/g, " ").trim();
    const normOrg = normalizeNombre(orgNameClean);
    const coreOrg = coreNombre(normOrg);
    const byName = nombreToId.get(normOrg) ?? coreToId.get(coreOrg) ?? null;

    const empresaId = byOrgId ?? byName ?? null;

    if (!empresaId) {
      skipped++;
      unmatched.push({
        title: deal.title,
        orgName,
        stage: dealStage,
      });
      continue;
    }

    // Upsert CrmEstado
    await prisma.crmEstado.upsert({
      where: { empresaId },
      create: {
        empresaId,
        pipedriveOrgId: orgId != null ? String(orgId) : null,
        dealStage,
        owner,
      },
      update: {
        pipedriveOrgId: orgId != null ? String(orgId) : null,
        dealStage,
        owner,
      },
    });

    matched++;
    console.log(`   ✓ [${dealStage.padEnd(12)}] ${orgName}`);
  }

  // 4. Resumen
  console.log("\n" + "─".repeat(60));
  console.log(`✅  Sync completado`);
  console.log(`   Matches:    ${matched} / ${deals.length}`);
  console.log(`   Sin match:  ${skipped}`);

  if (unmatched.length > 0) {
    console.log("\n⚠️   Sin match en nuestra DB:");
    for (const u of unmatched) {
      console.log(`   - "${u.orgName}"  [${u.stage}]`);
    }
    console.log(
      "\n   → Puedes añadir manualmente el CIF o ajustar el nombre en Pipedrive."
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
