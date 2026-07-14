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
import { prisma } from "../src/lib/prisma";
import { readWorkbook, sheetDataToRecords } from "../lib/excel";

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

const NOMINATIM_UA = "Fontiber-WarRoom/1.0 (internal geocoding)";

async function geocodeByPostalCode(
  cp: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?postalcode=${encodeURIComponent(cp)}&country=Spain&format=json&limit=1`;
    const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA } });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function geocodeByLocality(
  localidad: string,
  provincia: string | null
): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = provincia ? `${localidad}, ${provincia}, Spain` : `${localidad}, Spain`;
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA } });
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
  const [firstSheet] = await readWorkbook(EXCEL_PATH);
  if (!firstSheet) throw new Error("El Excel no contiene ninguna pestaña.");
  const rows = sheetDataToRecords(firstSheet.data, { emptyValue: null }) as ExcelRow[];
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

  // Collect companies to re-geocode by CP (more precise than locality)
  // cp → list of { id, localidad, provincia } for fallback
  const needGeocode = new Map<string, Array<{ id: number; localidad: string | null; provincia: string | null }>>();

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
    if (!empresa.empleados && row["Número empleados 2024"]) {
      const empRaw = row["Número empleados 2024"];
      const empInt = typeof empRaw === "number" ? Math.round(empRaw) : parseInt(String(empRaw), 10);
      if (!isNaN(empInt)) updateData.empleados = empInt;
    }

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

    // ── Geocoding: always re-geocode by CP (more precise than locality) ──────
    if (cp) {
      const localidad = row["Localidad"] ? String(row["Localidad"]).trim() : null;
      const provincia = row["Provincia"] ? String(row["Provincia"]).trim() : null;
      const list = needGeocode.get(cp) ?? [];
      list.push({ id: empresaId, localidad, provincia });
      needGeocode.set(cp, list);
    }
  }

  console.log(`✅ Matching:         ${matched} encontradas / ${notFound} no encontradas`);
  console.log(`   Financieros:      ${financierosUpserted} upserted`);
  console.log(`   Empresas fields:  ${empresasUpdated} actualizadas`);
  console.log(`\n📍 Geocoding por código postal — ${needGeocode.size} CPs únicos\n`);

  // ── Geocode: CP first, fallback to localidad ───────────────────────────────
  let cpIdx = 0;
  for (const [cp, items] of needGeocode) {
    cpIdx++;
    process.stdout.write(`[${String(cpIdx).padStart(3)}/${needGeocode.size}] CP ${cp}  `);

    const coordsCP = await geocodeByPostalCode(cp);
    await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS)); // rate-limit

    if (coordsCP) {
      // Apply to all companies sharing this CP
      for (const item of items) {
        await prisma.empresa.update({
          where: { id: item.id },
          data: { lat: coordsCP.lat, lng: coordsCP.lng },
        });
      }
      console.log(`✓ CP  ${coordsCP.lat.toFixed(4)}, ${coordsCP.lng.toFixed(4)}  (${items.length} empresa${items.length > 1 ? "s" : ""})`);
      geocoded += items.length;
    } else {
      // Fallback: geocode each company by its localidad
      console.log(`✗ CP  → fallback por localidad`);
      for (const item of items) {
        if (!item.localidad) {
          geocodeFailed++;
          continue;
        }
        process.stdout.write(`        localidad: ${item.localidad}  `);
        const coordsLoc = await geocodeByLocality(item.localidad, item.provincia);
        await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS)); // rate-limit

        if (coordsLoc) {
          await prisma.empresa.update({
            where: { id: item.id },
            data: { lat: coordsLoc.lat, lng: coordsLoc.lng },
          });
          console.log(`✓ Loc ${coordsLoc.lat.toFixed(4)}, ${coordsLoc.lng.toFixed(4)}`);
          geocoded++;
        } else {
          console.log(`✗ no encontrado`);
          geocodeFailed++;
        }
      }
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
