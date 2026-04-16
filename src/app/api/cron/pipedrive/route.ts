import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeNombre } from "@/lib/borme";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const API_KEY = process.env.PIPEDRIVE_API_KEY ?? "";
const BASE = "https://api.pipedrive.com/v1";
const DEALFLOW_PIPELINE_ID = 1;

const STAGE_MAP: Record<number, string> = {
  6: "identificado",
  7: "contactado",
  8: "primera_reunion",
  9: "analisis",
  10: "LOI enviada",
  11: "execution",
  12: "portfolio",
};

// Campo personalizado CIF en deals del pipeline Dealflow
const CIF_FIELD_KEY = "f7524d9f2b0ba3ec93adfd71bf8c6135d9c42d00";

interface PipedriveDeal {
  org_name?: string;
  title?: string;
  org_id?: { value: number } | null;
  user_id?: { name: string } | null;
  status: string;
  stage_id: number;
  [key: string]: unknown; // custom fields like CIF_FIELD_KEY
}

interface PipedriveResponse {
  success: boolean;
  data: PipedriveDeal[] | null;
  additional_data?: {
    pagination?: {
      more_items_in_collection?: boolean;
    };
  };
}

function coreNombre(nombre: string): string {
  return nombre
    .replace(/\s*\(.*?\)\s*/g, " ")  // elimina sufijos entre paréntesis, ej: "(Prodein)"
    .replace(/\b(SAU|SLU|SLL|SRL|SCL|SLNE|SLP|AIE|UTE|CB|SC|SA|SL)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAllDeals(): Promise<PipedriveDeal[]> {
  const all: PipedriveDeal[] = [];
  let start = 0;
  while (true) {
    const url =
      `${BASE}/deals?pipeline_id=${DEALFLOW_PIPELINE_ID}` +
      `&status=all_not_deleted&limit=500&start=${start}&api_token=${API_KEY}`;
    const res: PipedriveResponse = await fetch(url).then((r) => r.json());
    if (!res.success || !Array.isArray(res.data)) break;
    all.push(...res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  return all;
}

export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!API_KEY) {
    return NextResponse.json({ error: "PIPEDRIVE_API_KEY not set" }, { status: 500 });
  }

  try {
    const empresas = await prisma.empresa.findMany({
      select: { id: true, nombre: true, cif: true },
    });

    const cifToId = new Map<string, number>();
    const nombreToId = new Map<string, number>();
    const coreToId = new Map<string, number>();
    for (const e of empresas) {
      if (e.cif) cifToId.set(e.cif.toUpperCase().trim(), e.id);
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

    // Load existing CRM state for change detection
    const existingStates = await prisma.crmEstado.findMany({
      select: { empresaId: true, dealStage: true },
    });
    const existingStageMap = new Map<number, string | null>(
      existingStates.map((e) => [e.empresaId, e.dealStage])
    );

    let matched = 0, skipped = 0;

    // Resolve all deals to empresa matches first (CPU-only, fast)
    const resolved: Array<{
      empresaId: number; orgId: string | null; dealStage: string; owner: string | null;
    }> = [];

    for (const deal of deals) {
      const orgName: string = deal.org_name ?? deal.title ?? "";
      const orgId: number | null = deal.org_id?.value ?? null;
      const owner: string | null = deal.user_id?.name ?? null;

      let dealStage: string;
      if (deal.status === "lost") {
        dealStage = "muerto";
      } else if (deal.status === "won") {
        dealStage = "portfolio";
      } else {
        dealStage = STAGE_MAP[deal.stage_id] ?? "prospecto";
      }

      // 1ª prioridad: CIF del deal
      const dealCif: string | null = typeof deal[CIF_FIELD_KEY] === "string" ? deal[CIF_FIELD_KEY] : null;
      const byCif = dealCif ? cifToId.get(dealCif.toUpperCase().trim()) ?? null : null;
      // 2ª prioridad: orgId ya vinculado en CrmEstado
      const byOrgId = orgId != null ? orgIdToEmpresaId.get(String(orgId)) : null;
      // 3ª prioridad: nombre normalizado / core
      const orgNameClean = orgName.replace(/\s*\(.*?\)\s*/g, " ").trim();
      const normOrg = normalizeNombre(orgNameClean);
      const coreOrg = coreNombre(normOrg);
      const empresaId = byCif ?? byOrgId ?? nombreToId.get(normOrg) ?? coreToId.get(coreOrg) ?? null;

      if (!empresaId) { skipped++; continue; }

      resolved.push({
        empresaId,
        orgId: orgId != null ? String(orgId) : null,
        dealStage,
        owner,
      });
    }

    // Process DB writes in batches of 20 concurrently (much faster than sequential)
    const BATCH = 20;
    for (let i = 0; i < resolved.length; i += BATCH) {
      const batch = resolved.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async ({ empresaId, orgId, dealStage, owner }) => {
          const prevStage = existingStageMap.get(empresaId);
          const isNew = prevStage === undefined;
          const stageChanged = !isNew && prevStage !== dealStage;

          await prisma.crmEstado.upsert({
            where: { empresaId },
            create: { empresaId, pipedriveOrgId: orgId, dealStage, owner },
            update: { pipedriveOrgId: orgId, dealStage, owner },
          });

          if (isNew || stageChanged) {
            await prisma.crmLog.create({
              data: {
                empresaId,
                event: isNew ? "new_deal" : "stage_changed",
                fromStage: isNew ? null : (prevStage ?? null),
                toStage: dealStage,
                owner,
              },
            });
          }

          matched++;
        })
      );
    }

    return NextResponse.json({ success: true, deals: deals.length, matched, skipped });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
