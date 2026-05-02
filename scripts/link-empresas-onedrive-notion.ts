/**
 * Fase 1 del cut-over OneDrive + Notion: backfill one-off de los URLs para
 * empresas en stage >= primera_reunion (las que ya tienen carpeta y página
 * creada según el flujo actual de Alberto).
 *
 * Cascada del matcher (lib/empresa-link-matcher.ts):
 *   1. Match exacto por nombre normalizado.
 *   2. Si hay nombreComercial poblado, también con ese alias.
 *   3. Si no hay match → reportar como miss.
 *   4. Si hay >1 candidatos → reportar como ambiguo.
 *
 * Workflow:
 *   - Dry-run por defecto: imprime un reporte por empresa con OK / AMB / MISS.
 *     Para los AMB y MISS, listar los candidatos para que tú me digas qué hacer.
 *   - APPLY=1 escribe los URLs de los matches OK. NO toca empresas con AMB/MISS.
 *
 * Workflow recomendado:
 *   1. Ejecuta el dry-run.
 *   2. Para cada miss/ambiguo, decide:
 *      - Si la empresa tiene nombre comercial distinto → editar `nombreComercial`
 *        en el panel de la empresa (o en BD), y volver a ejecutar.
 *      - Si la carpeta/página NO existe en OneDrive/Notion → créala primero.
 *   3. Repite dry-run hasta que solo queden OK.
 *   4. Ejecuta APPLY=1.
 *
 * Ejecutar:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/link-empresas-onedrive-notion.ts
 *   APPLY=1 npx dotenv-cli -e .env.local -- npx tsx scripts/link-empresas-onedrive-notion.ts
 */
import { PrismaClient } from "@prisma/client";
import { matchEmpresasLinks, type EmpresaMatchResult } from "../src/lib/empresa-link-matcher";

const prisma = new PrismaClient();

// Stages a partir de los cuales una empresa ya tiene carpeta/página creada.
const STAGES_WITH_DOCS = [
  "primera_reunion",
  "analisis",
  "LOI enviada",
  "execution",
  "portfolio",
  "on_hold",
  "muerto",
];

function fmtMatch(label: string, outcome: EmpresaMatchResult["oneDrive"]): string {
  if (outcome.kind === "match") return `${label} ✅`;
  if (outcome.kind === "miss") return `${label} ❌ (probó: ${outcome.tried.join(" | ")})`;
  return `${label} ⚠️ ambiguo (${outcome.candidates.length} candidatos)`;
}

async function main() {
  const apply = process.env.APPLY === "1";
  console.log(apply ? "APPLY mode (escribiendo URLs)\n" : "DRY-RUN mode (sin cambios)\n");

  const empresas = await prisma.empresa.findMany({
    where: {
      crmEstado: { dealStage: { in: STAGES_WITH_DOCS } },
    },
    select: {
      id: true,
      nombre: true,
      nombreComercial: true,
      oneDriveUrl: true,
      notionUrl: true,
      crmEstado: { select: { dealStage: true } },
    },
    orderBy: { nombre: "asc" },
  });

  console.log(`Empresas en stages con docs: ${empresas.length}\n`);

  const results = await matchEmpresasLinks(empresas);

  let okCount = 0;
  let ambCount = 0;
  let missCount = 0;
  const ambiguousReport: string[] = [];
  const missReport: string[] = [];

  for (let i = 0; i < empresas.length; i++) {
    const e = empresas[i];
    const r = results[i];
    const stage = e.crmEstado?.dealStage ?? "?";
    const odLabel = fmtMatch("OneDrive", r.oneDrive);
    const nLabel = fmtMatch("Notion", r.notion);
    const status =
      r.oneDrive.kind === "match" && r.notion.kind === "match"
        ? "OK"
        : r.oneDrive.kind === "miss" && r.notion.kind === "miss"
        ? "MISS"
        : "PARTIAL";
    console.log(
      `[${status}] ${e.nombre} (${stage})  →  ${odLabel}  |  ${nLabel}`
    );

    // Acumuladores por estado total
    if (r.oneDrive.kind === "match") okCount++;
    else if (r.oneDrive.kind === "ambiguous") ambCount++;
    else missCount++;

    if (r.oneDrive.kind === "ambiguous") {
      ambiguousReport.push(
        `OneDrive — ${e.nombre}: ${r.oneDrive.candidates.map((c) => c.name).join(", ")}`
      );
    }
    if (r.notion.kind === "ambiguous") {
      ambiguousReport.push(
        `Notion — ${e.nombre}: ${r.notion.candidates.map((c) => c.title).join(", ")}`
      );
    }
    if (r.oneDrive.kind === "miss" && !e.oneDriveUrl) {
      missReport.push(`OneDrive — ${e.nombre} (id ${e.id}): probó ${r.oneDrive.tried.join(" | ")}`);
    }
    if (r.notion.kind === "miss" && !e.notionUrl) {
      missReport.push(`Notion — ${e.nombre} (id ${e.id}): probó ${r.notion.tried.join(" | ")}`);
    }

    if (apply) {
      const patch: { oneDriveUrl?: string; notionUrl?: string } = {};
      if (r.oneDrive.kind === "match") patch.oneDriveUrl = r.oneDrive.item.webUrl;
      if (r.notion.kind === "match") patch.notionUrl = r.notion.item.url;
      if (Object.keys(patch).length > 0) {
        await prisma.empresa.update({ where: { id: e.id }, data: patch });
      }
    }
  }

  console.log(`\nResumen OneDrive: ${okCount} match · ${ambCount} ambiguo · ${missCount} miss`);

  if (missReport.length > 0) {
    console.log(`\n⚠️  Sin match (${missReport.length}) — crea la carpeta/página o edita nombreComercial en el panel:`);
    for (const line of missReport.slice(0, 30)) console.log(`   ${line}`);
    if (missReport.length > 30) console.log(`   …y ${missReport.length - 30} más.`);
  }
  if (ambiguousReport.length > 0) {
    console.log(`\n⚠️  Ambiguos (${ambiguousReport.length}) — necesitan decisión manual:`);
    for (const line of ambiguousReport) console.log(`   ${line}`);
  }

  if (!apply) {
    console.log("\nDry-run completo. Ejecutar con APPLY=1 para escribir los matches OK.");
  } else {
    console.log("\n✅ Apply completo.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
