/**
 * check-pipedrive-unmatched.ts
 * Muestra los deals de Pipedrive que no matchean con ninguna empresa en la BD.
 * Separa activos (en pipeline) de cerrados (lost/won).
 *
 * Uso: npx dotenv-cli -e .env.local -- npx ts-node --compiler-options '{"module":"CommonJS","esModuleInterop":true}' scripts/check-pipedrive-unmatched.ts
 */

import { prisma } from "../src/lib/prisma";

function normalizeNombre(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const API_KEY = process.env.PIPEDRIVE_API_KEY ?? "";
const BASE = "https://api.pipedrive.com/v1";

const STAGE_MAP: Record<number, string> = {
  6: "identificado",
  7: "contactado",
  8: "primera_reunion",
  9: "analisis",
  10: "LOI enviada",
  11: "execution",
  12: "portfolio",
};

function coreNombre(nombre: string): string {
  return nombre
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\b(SAU|SLU|SLL|SRL|SCL|SLNE|SLP|AIE|UTE|CB|SC|SA|SL)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllDeals(): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  let start = 0;
  while (true) {
    const res = await fetch(
      `${BASE}/deals?pipeline_id=1&status=all_not_deleted&limit=500&start=${start}&api_token=${API_KEY}`
    ).then((r) => r.json());
    if (!res.success || !Array.isArray(res.data)) break;
    all.push(...res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  return all;
}

async function main() {
  // Construir lookup tables
  const empresas = await prisma.empresa.findMany({ select: { id: true, nombre: true } });
  const nombreToId = new Map<string, number>();
  const coreToId = new Map<string, number>();
  for (const e of empresas) {
    const norm = normalizeNombre(e.nombre);
    const core = coreNombre(norm);
    nombreToId.set(norm, e.id);
    if (!coreToId.has(core)) coreToId.set(core, e.id);
  }

  // OrgId → empresaId (ya vinculados)
  const existingCrm = await prisma.crmEstado.findMany({
    where: { pipedriveOrgId: { not: null } },
    select: { empresaId: true, pipedriveOrgId: true },
  });
  const orgIdToEmpresaId = new Map<string, number>();
  for (const c of existingCrm) {
    if (c.pipedriveOrgId) orgIdToEmpresaId.set(c.pipedriveOrgId, c.empresaId);
  }

  const deals = await fetchAllDeals();
  console.log(`Total deals en Pipedrive: ${deals.length}`);

  const active: Array<{ stage: string; orgName: string; orgId: number | null }> = [];
  const lost: Array<{ orgName: string }> = [];

  for (const deal of deals) {
    const orgName: string = deal.org_name ?? deal.title ?? "";
    const orgId: number | null = deal.org_id?.value ?? null;

    const byOrgId = orgId != null ? orgIdToEmpresaId.get(String(orgId)) : null;
    const orgNameClean = orgName.replace(/\s*\(.*?\)\s*/g, " ").trim();
    const normOrg = normalizeNombre(orgNameClean);
    const coreOrg = coreNombre(normOrg);
    const empresaId = byOrgId ?? nombreToId.get(normOrg) ?? coreToId.get(coreOrg) ?? null;

    if (!empresaId) {
      const stage =
        deal.status === "lost"
          ? "muerto"
          : deal.status === "won"
          ? "portfolio"
          : (STAGE_MAP[deal.stage_id as number] ?? `stage_${deal.stage_id}`);

      if (deal.status === "lost" || deal.status === "won") {
        lost.push({ orgName });
      } else {
        active.push({ stage, orgName, orgId });
      }
    }
  }

  console.log(`\n🔴 SIN MATCH — activos en pipeline (${active.length}):`);
  active
    .sort((a, b) => a.stage.localeCompare(b.stage))
    .forEach((d) =>
      console.log(`  [${d.stage}] ${d.orgName}${d.orgId ? ` (orgId=${d.orgId})` : ""}`)
    );

  console.log(`\n⚫ SIN MATCH — cerrados lost/won (${lost.length}) — primeros 10:`);
  lost.slice(0, 10).forEach((d) => console.log(`  ${d.orgName}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
