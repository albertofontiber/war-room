/**
 * import-financieros-seg-electronica.ts
 *
 * Imports financial data + enriches company fields for seguridad electrónica
 * companies from the Informa extract Excel.
 *
 * What it does per matched company:
 *   - Creates/updates Financiero records for 2022, 2023, 2024
 *   - Updates Empresa: empleados (2024), web, telefono, codigoPostal
 *   - Geocodes companies with missing lat/lng using their postal code
 *     via Nominatim (OpenStreetMap) — rate-limited to 1 req/s
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/import-financieros-seg-electronica.ts
 *
 * Safe to re-run: upserts financieros, only updates empresa fields if value
 * is present in the Excel and current DB value is null.
 */

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";

const EXCEL_PATH = path.join(
  __dirname,
  "../files/20260402 extracto informa Empresas seguridad electrónica.xlsx"
);
const GEOCODE_DELAY_MS = 1100; // Nominatim: max 1 req/s

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExcelRow {
  "Código NIF": string | null;
  Nombre: string | null;
  Calle: string | null;
  "Código postal": string | number | null;
  Localidad: string | null;
  Provincia: string | null;
  "Comunidad autónoma": string | null;
  Teléfono: string | null;
  "Dirección web": string | null;
  "Número empleados 2022": number | null;
  "Número empleados 2023": number | null;
  "Número empleados 2024": number | null;
  "Ingresos de explotación mil EUR 2022": number | null;
  "Ingresos de explotación mil EUR 2023": number | null;
  "Ingresos de explotación mil EUR 2024": number | null;
  "Resultado bruto mil EUR 2022": number | null;
  "Resultado bruto mil EUR 2023": number | null;
  "Resultado bruto mil EUR 2024": number | null;
  "EBITDA mil EUR 2022": number | null;
  "EBITDA mil EUR 2023": number | null;
  "EBITDA mil EUR 2024": number | null;
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

async function geocodeByPostalCode(
  cp: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?postalcode=${encodeURIComponent(cp)}&country=Spain&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Fontiber-WarRoom/1.0 (internal geocoding)" },
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v: number | null | undefined): number | null {
  if (v == null || isNaN(v)) return null;
  // Excel values are in thousands of EUR → convert to EUR
  return Math.round(v * 1000);
}

function normalizeCif(cif: string | null): string | null {
  if (!cif) return null;
  return cif.toString().trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeCP(cp: string | number | null): string | null {
  if (cp == null) return null;
  const s = cp.toString().trim().padStart(5, "0");
  return s.length <= 6 ? s : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n📊 Import Financieros — Seguridad Electrónica");
  console.log(`   Excel: ${path.basename(EXCEL_PATH)}\n`);

  // Load Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as ExcelRow[];
  console.log(`   Filas en Excel: ${rows.length}`);

  // Load all companies (just CIF + id + current lat/lng + fields to check)
  const empresas = await prisma.empresa.findMany({
    select: {
      id: true,
      cif: true,
      lat: true,
      lng: true,
      web: true,
      empleados: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cifMap = new Map<string, any>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    empresas.map((e: any) => [e.cif.toUpperCase(), e])
  );

  console.log(`   Empresas en DB: ${empresas.length}\n`);

  let matched = 0,
    notFound = 0,
    financierosUpserted = 0,
    empresasUpdated = 0,
    geocoded = 0,
    geocodeFailed = 0;

  // Collect postal codes that need geocoding: cp → empresaId[]
  const needGeocode = new Map<string, number[]>();

  for (const row of rows) {
    const cif = normalizeCif(row["Código NIF"]);
    if (!cif) {
      notFound++;
      continue;
    }

    const empresa = cifMap.get(cif);
    if (!empresa) {
      notFound++;
      continue;
    }

    matched++;
    const empresaId: number = empresa.id;

    // ── Financieros ─────────────────────────────────────────────────────────
    const years = [2022, 2023, 2024] as const;
    for (const year of years) {
      const ingresos = num(row[`Ingresos de explotación mil EUR ${year}`]);
      const margenBruto = num(row[`Resultado bruto mil EUR ${year}`]);
      const ebitda = num(row[`EBITDA mil EUR ${year}`]);

      if (ingresos == null && margenBruto == null && ebitda == null) continue;

      await prisma.financiero.upsert({
        where: { empresaId_anio: { empresaId, anio: year } },
        create: { empresaId, anio: year, ingresos, margenBruto, ebitda, fuente: "informa_2026" },
        update: { ingresos, margenBruto, ebitda, fuente: "informa_2026" },
      });
      financierosUpserted++;
    }

    // ── Empresa fields ───────────────────────────────────────────────────────
    const cp = normalizeCP(row["Código postal"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    // Only update if current value is null/empty
    if (!empresa.web && row["Dirección web"])
      updateData.web = (row["Dirección web"] as string).trim();
    if (!empresa.empleados && row["Número empleados 2024"])
      updateData.empleados = row["Número empleados 2024"];

    // New fields — always update from Excel (authoritative source)
    if (row["Teléfono"]) updateData.telefono = (row["Teléfono"] as string).trim();
    if (cp) updateData.codigoPostal = cp;

    if (Object.keys(updateData).length > 0) {
      await prisma.empresa.update({
        where: { id: empresaId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: updateData as any,
      });
      empresasUpdated++;
    }

    // ── Geocoding needed? ────────────────────────────────────────────────────
    if (!empresa.lat && cp) {
      const list = needGeocode.get(cp) ?? [];
      list.push(empresaId);
      needGeocode.set(cp, list);
    }
  }

  console.log(`✅ Matching:         ${matched} encontradas / ${notFound} no encontradas`);
  console.log(`   Financieros:      ${financierosUpserted} upserted`);
  console.log(`   Empresas fields:  ${empresasUpdated} actualizadas`);
  console.log(`\n📍 Geocoding por código postal — ${needGeocode.size} CPs únicos\n`);

  // ── Geocode by unique postal code ──────────────────────────────────────────
  let cpIdx = 0;
  for (const [cp, ids] of needGeocode) {
    cpIdx++;
    process.stdout.write(`[${String(cpIdx).padStart(3)}/${needGeocode.size}] CP ${cp}  `);

    const coords = await geocodeByPostalCode(cp);
    if (coords) {
      // Apply to all companies with this CP
      for (const id of ids) {
        await prisma.empresa.update({
          where: { id },
          data: { lat: coords.lat, lng: coords.lng },
        });
      }
      console.log(`✓  ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}  (${ids.length} empresa${ids.length > 1 ? "s" : ""})`);
      geocoded += ids.length;
    } else {
      console.log(`✗  no encontrado`);
      geocodeFailed += ids.length;
    }

    // Rate limit: 1 req/s
    if (cpIdx < needGeocode.size) {
      await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS));
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅  Import completado`);
  console.log(`   Matched:          ${matched}`);
  console.log(`   No encontradas:   ${notFound}`);
  console.log(`   Financieros:      ${financierosUpserted}`);
  console.log(`   Empresas updates: ${empresasUpdated}`);
  console.log(`   Geocoded:         ${geocoded} empresas (${needGeocode.size - geocodeFailed} CPs ok)`);
  if (geocodeFailed > 0) console.log(`   Geocode fallos:   ${geocodeFailed} empresas`);
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
