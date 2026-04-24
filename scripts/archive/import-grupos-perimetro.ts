/**
 * import-grupos-perimetro.ts
 * Actualiza grupoId y enPerimetro usando batch SQL para máxima velocidad.
 * Uso: npx tsx scripts/import-grupos-perimetro.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import path from "path";

const prisma = new PrismaClient();
const FILES_DIR = path.join(process.cwd(), "files");

function readExcel(filename: string): Record<string, string>[] {
  const wb = XLSX.readFile(path.join(FILES_DIR, filename));
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, string>[];
}

function normalizeCif(raw: string): string {
  return String(raw ?? "").trim().toUpperCase();
}

async function main() {
  // ── 1. GRUPOS ──────────────────────────────────────────────────────────────
  console.log("\n=== GRUPOS ===");
  const gruposRows = readExcel("20260329 Grupos.xlsx");

  // Detect real groups (group name appears for >1 company)
  const groupCounts: Record<string, number> = {};
  for (const row of gruposRows) {
    const g = String(row["Group"] ?? "").trim();
    groupCounts[g] = (groupCounts[g] ?? 0) + 1;
  }
  const realGroupNames = Object.entries(groupCounts)
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  console.log(`Grupos reales detectados: ${realGroupNames.length}`);
  realGroupNames.forEach(g => console.log(`  - ${g} (${groupCounts[g]} empresas)`));

  // Clean up all existing grupos and reset grupoId
  console.log("\nLimpiando grupos anteriores...");
  await prisma.empresa.updateMany({ data: { grupoId: null } });
  await prisma.grupo.deleteMany({});
  console.log("Grupos anteriores eliminados.");

  // Create new Grupo records
  const grupoIdMap = new Map<string, number>();
  for (const groupName of realGroupNames) {
    const g = await prisma.grupo.create({ data: { nombre: groupName, tipo: "nacional" } });
    grupoIdMap.set(groupName, g.id);
  }
  console.log(`Creados ${grupoIdMap.size} grupos nuevos.`);

  // Build batch: group CIFs by grupoId
  const grupoToCifs = new Map<number, string[]>();
  let grupoUnmatched = 0;
  for (const row of gruposRows) {
    const cif = normalizeCif(row["CIF/NIF"]);
    const groupName = String(row["Group"] ?? "").trim();
    if (!cif || !grupoIdMap.has(groupName)) continue;
    const id = grupoIdMap.get(groupName)!;
    if (!grupoToCifs.has(id)) grupoToCifs.set(id, []);
    grupoToCifs.get(id)!.push(cif);
  }

  // One query per real group (only 4 queries total)
  let grupoMatched = 0;
  for (const [grupoId, cifs] of grupoToCifs) {
    const result = await prisma.empresa.updateMany({
      where: { cif: { in: cifs } },
      data: { grupoId },
    });
    grupoMatched += result.count;
    console.log(`  grupoId=${grupoId}: ${result.count}/${cifs.length} empresas actualizadas`);
  }

  console.log(`\nResultado grupos:`);
  console.log(`  Asignados a grupo real: ${grupoMatched}`);
  console.log(`  Sin grupo (standalone): ${gruposRows.length - grupoMatched - grupoUnmatched}`);

  // ── 2. PERÍMETRO ───────────────────────────────────────────────────────────
  console.log("\n=== PERÍMETRO ===");
  const perimetroRows = readExcel("20260329 Perimetro.xlsx");

  const cifIn: string[] = [];
  const cifOut: string[] = [];
  for (const row of perimetroRows) {
    const cif = normalizeCif(row["CIF/NIF"]);
    const perimeter = String(row["Perimeter"] ?? "").trim();
    if (!cif) continue;
    if (perimeter === "In perimeter") cifIn.push(cif);
    else cifOut.push(cif);
  }

  // Just 2 queries total
  const inResult = await prisma.empresa.updateMany({
    where: { cif: { in: cifIn } },
    data: { enPerimetro: true, enPerimetroAt: new Date() },
  });
  const outResult = await prisma.empresa.updateMany({
    where: { cif: { in: cifOut } },
    data: { enPerimetro: false, enPerimetroAt: new Date() },
  });

  console.log(`\nResultado perímetro:`);
  console.log(`  In perimeter: ${inResult.count} (de ${cifIn.length} en Excel)`);
  console.log(`  Out of perimeter: ${outResult.count} (de ${cifOut.length} en Excel)`);

  console.log("\n✅ Importación completada.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
