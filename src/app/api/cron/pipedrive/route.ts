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
  8: "contactado",
  9: "contactado",
  10: "LOI enviada",
  11: "execution",
  12: "portfolio",
};

function coreNombre(nombre: string): string {
  return nombre
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
      `&status=all_not_deleted&limit=500&start=${start}&api_token=${API_KEY}`;
    const res = await fetch(url).then((r) => r.json());
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

    const deals = await fetchAllDeals();

    const existingCrm = await prisma.crmEstado.findMany({
      where: { pipedriveOrgId: { not: null } },
      select: { empresaId: true, pipedriveOrgId: true },
    });
    const orgIdToEmpresaId = new Map<string, number>();
    for (const c of existingCrm) {
      if (c.pipedriveOrgId) orgIdToEmpresaId.set(c.pipedriveOrgId, c.empresaId);
    }

    let matched = 0, skipped = 0;

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
        dealStage = STAGE_MAP[deal.stage_id as number] ?? "prospecto";
      }

      const byOrgId = orgId != null ? orgIdToEmpresaId.get(String(orgId)) : null;
      const normOrg = normalizeNombre(orgName);
      const coreOrg = coreNombre(normOrg);
      const empresaId = byOrgId ?? nombreToId.get(normOrg) ?? coreToId.get(coreOrg) ?? null;

      if (!empresaId) { skipped++; continue; }

      await prisma.crmEstado.upsert({
        where: { empresaId },
        create: { empresaId, pipedriveOrgId: orgId != null ? String(orgId) : null, dealStage, owner },
        update: { pipedriveOrgId: orgId != null ? String(orgId) : null, dealStage, owner },
      });
      matched++;
    }

    return NextResponse.json({ success: true, deals: deals.length, matched, skipped });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
