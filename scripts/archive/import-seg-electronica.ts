/**
 * import-seg-electronica.ts
 * Importa empresas de seguridad electrónica desde Excel.
 *
 * Lógica:
 *  - CIF ya existe en DB como PCI → sector = "mixto", actualiza ambitoGeo
 *  - CIF no existe → crea nueva empresa con sector = "seguridad_electronica", enPerimetro = true
 *
 * Tras ejecutar, correr: npx tsx scripts/geocoding.ts  (para geocodificar nuevas sin lat/lng)
 *
 * Uso: npx tsx scripts/import-seg-electronica.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import path from "path";

const prisma = new PrismaClient();
const FILE = path.join(process.cwd(), "files", "seguridad_electrónica.xlsx");

// ─── CCAA normalización: Excel uppercase → formato BD ───────────────────────
const CCAA_MAP: Record<string, string> = {
  "ANDALUCÍA":        "Andalucía",
  "ANDALUCIA":        "Andalucía",
  "ARAGÓN":           "Aragón",
  "ARAGON":           "Aragón",
  "ASTURIAS":         "Asturias",
  "C. VALENCIANA":    "C. Valenciana",
  "CANTABRIA":        "Cantabria",
  "CASTILLA Y LEÓN":  "Castilla y León",
  "CASTILLA Y LEON":  "Castilla y León",
  "CASTILLA LA MANCHA": "Castilla-La Mancha",
  "CASTILLA-LA MANCHA": "Castilla-La Mancha",
  "CATALUÑA":         "Cataluña",
  "CATALUNA":         "Cataluña",
  "cataluña":         "Cataluña",
  "EXTREMADURA":      "Extremadura",
  "GALICIA":          "Galicia",
  "ISLAS BALEARES":   "Illes Balears",
  "ILLES BALEARS":    "Illes Balears",
  "ISLAS CANARIAS":   "Canarias",
  "CANARIAS":         "Canarias",
  "LA RIOJA":         "La Rioja",
  "MADRID":           "Madrid",
  "MURCIA":           "Murcia",
  "NAVARRA":          "Navarra",
  "PAÍS VASCO":       "País Vasco",
  "PAIS VASCO":       "País Vasco",
  "CEUTA":            "Ceuta",
  "MELILLA":          "Melilla",
};

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeCif(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

async function main() {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];

  console.log(`Filas en Excel: ${rows.length}`);

  // Fetch all existing CIFs in one query
  const existing = await prisma.empresa.findMany({ select: { id: true, cif: true, sector: true } });
  const cifMap = new Map(existing.map(e => [e.cif.toUpperCase(), e]));

  const toCreate: {
    cif: string; nombre: string; ccaa: string | null; provincia: string | null;
    localidad: string | null; ambitoGeo: string; sector: string; enPerimetro: boolean;
    fuente: string;
  }[] = [];
  const toUpdateMixto: { id: number; ambitoGeo: string }[] = [];

  let skipped = 0;

  for (const row of rows) {
    const cif   = normalizeCif(row["CIF/NIF"]);
    const name  = String(row["Company name"] ?? "").trim();
    const ccaaRaw = String(row["Comunidad autónoma"] ?? "").trim();
    const provRaw = String(row["Provincia"] ?? "").trim();
    const loc   = String(row["Localidad"] ?? "").trim() || null;
    const ambito = String(row["ámbito geográfico seguridad electrónica"] ?? "").trim().toUpperCase();

    if (!cif || !name) { skipped++; continue; }

    const ccaa = CCAA_MAP[ccaaRaw] ?? toTitleCase(ccaaRaw) ?? null;
    const prov = provRaw ? toTitleCase(provRaw) : null;
    const ambitoGeo = ambito === "E" ? "E" : "A";

    const existing_empresa = cifMap.get(cif);
    if (existing_empresa) {
      // Already in DB — update to mixto + ambitoGeo
      toUpdateMixto.push({ id: existing_empresa.id, ambitoGeo });
    } else {
      // New empresa
      toCreate.push({
        cif, nombre: name, ccaa, provincia: prov, localidad: loc,
        ambitoGeo, sector: "seguridad_electronica", enPerimetro: true,
        fuente: "excel_seg_electronica",
      });
    }
  }

  console.log(`\nExistentes en BD (PCI → mixto): ${toUpdateMixto.length}`);
  console.log(`Nuevas a crear (seg. electrónica): ${toCreate.length}`);
  console.log(`Filas saltadas (sin CIF/nombre): ${skipped}`);

  // ── Update existing to mixto ──────────────────────────────────────────────
  if (toUpdateMixto.length > 0) {
    // Batch by ambitoGeo value
    const ids_E = toUpdateMixto.filter(r => r.ambitoGeo === "E").map(r => r.id);
    const ids_A = toUpdateMixto.filter(r => r.ambitoGeo === "A").map(r => r.id);
    if (ids_E.length) {
      await prisma.empresa.updateMany({ where: { id: { in: ids_E } }, data: { sector: "mixto", ambitoGeo: "E" } });
    }
    if (ids_A.length) {
      await prisma.empresa.updateMany({ where: { id: { in: ids_A } }, data: { sector: "mixto", ambitoGeo: "A" } });
    }
    console.log(`\n✅ ${toUpdateMixto.length} empresas actualizadas a "mixto"`);
  }

  // ── Create new empresas in batches of 100 ────────────────────────────────
  if (toCreate.length > 0) {
    const BATCH = 100;
    let created = 0;
    for (let i = 0; i < toCreate.length; i += BATCH) {
      const batch = toCreate.slice(i, i + BATCH);
      await prisma.empresa.createMany({ data: batch, skipDuplicates: true });
      created += batch.length;
      process.stdout.write(`\rCreando nuevas empresas: ${created}/${toCreate.length}`);
    }
    console.log(`\n✅ ${toCreate.length} nuevas empresas de seg. electrónica creadas`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalSeg = await prisma.empresa.count({ where: { sector: { in: ["seguridad_electronica", "mixto"] } } });
  const totalMixto = await prisma.empresa.count({ where: { sector: "mixto" } });
  const totalNuevas = await prisma.empresa.count({ where: { sector: "seguridad_electronica" } });
  console.log(`\n📊 Estado final:`);
  console.log(`   Total empresas con seg. electrónica: ${totalSeg}`);
  console.log(`   - Solo seg. electrónica: ${totalNuevas}`);
  console.log(`   - Mixto (PCI + seg. elec.): ${totalMixto}`);
  console.log(`\n⚠️  Recuerda: las nuevas empresas no tienen lat/lng.`);
  console.log(`   Ejecuta: npx tsx scripts/geocoding.ts`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
