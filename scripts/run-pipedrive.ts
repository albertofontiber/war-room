/**
 * Ejecuta el sync de Pipedrive contra la base de datos de producción.
 * Uso: npx dotenv-cli -e .env.local -- npx tsx scripts/run-pipedrive.ts
 */
import { prisma } from "../src/lib/prisma";
import { normalizeNombre } from "../src/lib/borme";

const API_KEY = process.env.PIPEDRIVE_API_KEY ?? "";
const BASE = "https://api.pipedrive.com/v1";
const DEALFLOW_PIPELINE_ID = 1;

const STAGE_MAP: Record<number, string> = {
  6: "identificado", 7: "contactado", 8: "primera_reunion",
  9: "analisis", 10: "LOI enviada", 11: "execution", 12: "portfolio",
};

function coreNombre(nombre: string): string {
  return nombre
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\b(SAU|SLU|SLL|SRL|SCL|SLNE|SLP|AIE|UTE|CB|SC|SA|SL)\b/g, "")
    .replace(/\s+/g, " ").trim();
}

async function fetchAllDeals() {
  const all: unknown[] = [];
  let start = 0;
  while (true) {
    const url = `${BASE}/deals?pipeline_id=${DEALFLOW_PIPELINE_ID}&status=all_not_deleted&limit=500&start=${start}&api_token=${API_KEY}`;
    const res = await fetch(url).then(r => r.json());
    if (!res.success || !Array.isArray(res.data)) break;
    all.push(...res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  return all;
}

async function main() {
  if (!API_KEY) { console.error("PIPEDRIVE_API_KEY not set"); process.exit(1); }

  const empresas = await prisma.empresa.findMany({ select: { id: true, nombre: true } });
  const nombreToId = new Map<string, number>();
  const coreToId = new Map<string, number>();
  for (const e of empresas) {
    const norm = normalizeNombre(e.nombre);
    const core = coreNombre(norm);
    nombreToId.set(norm, e.id);
    if (!coreToId.has(core)) coreToId.set(core, e.id);
  }

  const deals = await fetchAllDeals();
  const existingCrm = await prisma.crmEstado.findMany({
    where: { pipedriveOrgId: { not: null } },
    select: { empresaId: true, pipedriveOrgId: true },
  });
  const orgIdToEmpresaId = new Map<string, number>();
  for (const c of existingCrm) {
    if (c.pipedriveOrgId) orgIdToEmpresaId.set(c.pipedriveOrgId, c.empresaId);
  }
  const existingStates = await prisma.crmEstado.findMany({ select: { empresaId: true, dealStage: true } });
  const existingStageMap = new Map<number, string | null>(existingStates.map(e => [e.empresaId, e.dealStage]));

  let matched = 0, skipped = 0;
  for (const deal of deals as Record<string, unknown>[]) {
    const orgName = (deal.org_name ?? deal.title ?? "") as string;
    const orgId = (deal.org_id as { value?: number } | null)?.value ?? null;
    const owner = (deal.user_id as { name?: string } | null)?.name ?? null;
    let dealStage: string;
    if (deal.status === "lost") dealStage = "muerto";
    else if (deal.status === "won") dealStage = "portfolio";
    else dealStage = STAGE_MAP[deal.stage_id as number] ?? "prospecto";

    const byOrgId = orgId != null ? orgIdToEmpresaId.get(String(orgId)) : null;
    const normOrg = normalizeNombre(orgName.replace(/\s*\(.*?\)\s*/g, " ").trim());
    const coreOrg = coreNombre(normOrg);
    const empresaId = byOrgId ?? nombreToId.get(normOrg) ?? coreToId.get(coreOrg) ?? null;
    if (!empresaId) { skipped++; continue; }

    const prevStage = existingStageMap.get(empresaId);
    const isNew = prevStage === undefined;
    const stageChanged = !isNew && prevStage !== dealStage;
    await prisma.crmEstado.upsert({
      where: { empresaId },
      create: { empresaId, pipedriveOrgId: orgId != null ? String(orgId) : null, dealStage, owner },
      update: { pipedriveOrgId: orgId != null ? String(orgId) : null, dealStage, owner },
    });
    if (isNew || stageChanged) {
      await prisma.crmLog.create({ data: { empresaId, event: isNew ? "new_deal" : "stage_changed", fromStage: isNew ? null : (prevStage ?? null), toStage: dealStage, owner } });
    }
    matched++;
  }

  console.log(`✅ Pipedrive sync: ${deals.length} deals, ${matched} matched, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch(console.error);
