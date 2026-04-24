/**
 * geocoding.ts
 * Geocodifica empresas sin lat/lng usando Nominatim (OpenStreetMap) — gratuito, sin API key.
 *
 * Cascada de precisión:
 *   1. Dirección + localidad + provincia  (nivel calle)
 *   2. CP + localidad + provincia         (nivel código postal)
 *   3. Localidad + provincia              (nivel municipio)
 *   4. Provincia / CCAA                   (fallback)
 *
 * Modos:
 *   --missing     Solo empresas sin coordenadas (default)
 *   --all         Re-geocodifica TODAS las empresas (mejora precisión)
 *   --dry-run     Preview sin escribir en BD
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/geocoding.ts
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/geocoding.ts --all
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/geocoding.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DELAY_MS = 1100; // Nominatim: máx 1 req/seg

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface GeoResult {
  lat: number;
  lng: number;
  nivel: string;
}

async function nominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: query,
      countrycodes: "es",
      format: "json",
      limit: "1",
      addressdetails: "0",
    });

  const res = await fetch(url, {
    headers: { "User-Agent": "Fontiber-WarRoom/1.0 (internal tool)" },
  });

  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data.length) return null;

  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function geocodeEmpresa(empresa: {
  direccion: string | null;
  codigoPostal: string | null;
  localidad: string | null;
  provincia: string | null;
  ccaa: string | null;
}): Promise<GeoResult | null> {
  const { direccion, codigoPostal, localidad, provincia, ccaa } = empresa;

  // Nivel 1: dirección + localidad + provincia
  if (direccion && localidad && provincia) {
    const coords = await nominatim(`${direccion}, ${localidad}, ${provincia}`);
    if (coords) return { ...coords, nivel: "direccion" };
    await sleep(DELAY_MS);
  }

  // Nivel 2: CP + localidad + provincia
  if (codigoPostal && localidad && provincia) {
    const coords = await nominatim(`${codigoPostal} ${localidad}, ${provincia}`);
    if (coords) return { ...coords, nivel: "cp" };
    await sleep(DELAY_MS);
  }

  // Nivel 2b: CP solo
  if (codigoPostal) {
    const coords = await nominatim(`${codigoPostal}, España`);
    if (coords) return { ...coords, nivel: "cp" };
    await sleep(DELAY_MS);
  }

  // Nivel 3: localidad + provincia
  if (localidad && provincia) {
    const coords = await nominatim(`${localidad}, ${provincia}`);
    if (coords) return { ...coords, nivel: "localidad" };
    await sleep(DELAY_MS);
  }

  // Nivel 3b: solo localidad
  if (localidad) {
    const coords = await nominatim(`${localidad}, España`);
    if (coords) return { ...coords, nivel: "localidad" };
    await sleep(DELAY_MS);
  }

  // Nivel 4: provincia
  if (provincia) {
    const coords = await nominatim(`${provincia}, España`);
    if (coords) return { ...coords, nivel: "provincia" };
    await sleep(DELAY_MS);
  }

  // Nivel 5: CCAA
  if (ccaa) {
    const coords = await nominatim(`${ccaa}, España`);
    if (coords) return { ...coords, nivel: "ccaa" };
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const allMode = args.includes("--all");
  const dryRun = args.includes("--dry-run");

  const where = allMode ? {} : { OR: [{ lat: null as any }, { lng: null as any }] };

  const empresas = await prisma.empresa.findMany({
    where,
    select: {
      id: true,
      cif: true,
      nombre: true,
      direccion: true,
      codigoPostal: true,
      localidad: true,
      provincia: true,
      ccaa: true,
      lat: true,
      lng: true,
    },
    orderBy: { id: "asc" },
  });

  if (empresas.length === 0) {
    console.log("✅  Todas las empresas ya tienen coordenadas.");
    return;
  }

  console.log(`\n📍  ${empresas.length} empresas a geocodificar${allMode ? " (modo --all)" : ""}`);
  if (dryRun) console.log("🔒  Modo --dry-run: no se escribirá en BD");
  console.log(`⏱️   Tiempo estimado: ~${Math.ceil((empresas.length * DELAY_MS) / 60000)} min\n`);
  console.log("─".repeat(64));

  const stats = { direccion: 0, cp: 0, localidad: 0, provincia: 0, ccaa: 0, sinResultado: 0, errores: 0 };
  let actualizadas = 0;

  for (let i = 0; i < empresas.length; i++) {
    const emp = empresas[i];
    await sleep(DELAY_MS);

    try {
      const result = await geocodeEmpresa(emp);

      if (result) {
        stats[result.nivel as keyof typeof stats]++;
        actualizadas++;

        if (!dryRun) {
          await prisma.empresa.update({
            where: { id: emp.id },
            data: { lat: result.lat, lng: result.lng },
          });
        }

        const icon = result.nivel === "direccion" ? "📍" : result.nivel === "cp" ? "📮" : result.nivel === "localidad" ? "🏘️" : "⚠️";
        const pct = Math.round(((i + 1) / empresas.length) * 100);
        process.stdout.write(
          `\r${icon} [${i + 1}/${empresas.length}] (${pct}%) ${emp.nombre.substring(0, 35).padEnd(35)} → ${result.nivel}   `
        );
      } else {
        stats.sinResultado++;
        process.stdout.write(
          `\r❌  [${i + 1}/${empresas.length}] Sin resultado: ${emp.nombre.substring(0, 40)}                   \n`
        );
      }
    } catch (err) {
      stats.errores++;
      console.error(`\n💥  Error en ${emp.cif} ${emp.nombre}:`, err);
    }
  }

  console.log("\n\n" + "═".repeat(64));
  console.log("RESUMEN GEOCODING");
  console.log("═".repeat(64));
  console.log(`📍  Dirección (nivel calle):    ${stats.direccion}`);
  console.log(`📮  Código postal:              ${stats.cp}`);
  console.log(`🏘️   Localidad (municipio):      ${stats.localidad}`);
  console.log(`⚠️   Provincia/CCAA (fallback):  ${stats.provincia + stats.ccaa}`);
  console.log(`❌  Sin resultado:              ${stats.sinResultado}`);
  if (stats.errores) console.log(`💥  Errores:                    ${stats.errores}`);
  console.log(`🏢  Empresas actualizadas:      ${actualizadas}`);
  if (dryRun) console.log(`🔒  (dry-run — nada escrito en BD)`);
  console.log("═".repeat(64) + "\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
