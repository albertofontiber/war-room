/**
 * geocoding.ts
 * Geocodifica empresas sin lat/lng usando Nominatim (OpenStreetMap) — gratuito, sin API key.
 *
 * Optimización: geocodifica por localidad única (no por empresa),
 * luego asigna las mismas coordenadas a todas las empresas de esa localidad.
 * Reduce las llamadas a la API de ~4000 a ~1000.
 *
 * Uso:
 *   npx tsx scripts/geocoding.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DELAY_MS = 1100; // Nominatim: máx 1 req/seg

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
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

async function main() {
  // ── Obtener localidades únicas sin geocodificar ──────────────────────────
  type LocalidadRow = { localidad: string | null; provincia: string | null; ccaa: string | null };
  const localidades = await prisma.$queryRaw<LocalidadRow[]>`
    SELECT DISTINCT localidad, provincia, ccaa
    FROM "Empresa"
    WHERE lat IS NULL OR lng IS NULL
    ORDER BY provincia, localidad
  `;

  if (localidades.length === 0) {
    console.log("✅  Todas las empresas ya tienen coordenadas.");
    return;
  }

  const totalEmpresas = await prisma.empresa.count({
    where: { OR: [{ lat: null }, { lng: null }] },
  });

  console.log(`\n📍  ${totalEmpresas} empresas sin coordenadas`);
  console.log(`🗺️   ${localidades.length} localidades únicas a geocodificar`);
  console.log(`⏱️   Tiempo estimado: ~${Math.ceil((localidades.length * DELAY_MS) / 60000)} min\n`);
  console.log("─".repeat(64));

  let ok = 0, fallback = 0, noResult = 0, errores = 0;
  let empresasActualizadas = 0;

  for (let i = 0; i < localidades.length; i++) {
    const { localidad, provincia, ccaa } = localidades[i];
    await sleep(DELAY_MS);

    try {
      let coords: { lat: number; lng: number } | null = null;
      let nivel = "";

      // Intento 1: localidad + provincia
      if (localidad && provincia) {
        coords = await geocode(`${localidad}, ${provincia}`);
        if (coords) nivel = "localidad+provincia";
      }

      // Intento 2: solo localidad
      if (!coords && localidad) {
        await sleep(DELAY_MS);
        coords = await geocode(`${localidad}, España`);
        if (coords) nivel = "localidad";
      }

      // Intento 3: provincia
      if (!coords && provincia) {
        await sleep(DELAY_MS);
        coords = await geocode(`${provincia}, España`);
        if (coords) nivel = "provincia";
      }

      // Intento 4: CCAA
      if (!coords && ccaa) {
        await sleep(DELAY_MS);
        coords = await geocode(`${ccaa}, España`);
        if (coords) nivel = "ccaa";
      }

      if (coords) {
        // Actualizar todas las empresas de esta localidad en un solo query
        const updated = await prisma.empresa.updateMany({
          where: {
            localidad: localidad ?? undefined,
            provincia: provincia ?? undefined,
            OR: [{ lat: null }, { lng: null }],
          },
          data: { lat: coords.lat, lng: coords.lng },
        });
        empresasActualizadas += updated.count;

        const pct = Math.round(((i + 1) / localidades.length) * 100);
        const tag = nivel === "localidad+provincia" ? "✅" : "⚠️ ";
        process.stdout.write(
          `\r${tag} [${i + 1}/${localidades.length}] (${pct}%) ${localidad ?? "-"}, ${provincia ?? "-"}  (+${updated.count} emp)   `
        );

        if (nivel === "localidad+provincia") ok++;
        else fallback++;
      } else {
        noResult++;
        process.stdout.write(
          `\r❌  [${i + 1}/${localidades.length}] Sin resultado: ${localidad ?? "-"}, ${provincia ?? "-"}                   \n`
        );
      }
    } catch (err) {
      errores++;
      console.error(`\n💥  Error en ${localidad}, ${provincia}:`, err);
    }
  }

  console.log("\n\n" + "═".repeat(64));
  console.log("RESUMEN GEOCODING");
  console.log("═".repeat(64));
  console.log(`✅  Exacto (localidad+provincia): ${ok}`);
  console.log(`⚠️   Fallback (nivel superior):   ${fallback}`);
  console.log(`❌  Sin resultado:                ${noResult}`);
  if (errores) console.log(`💥  Errores:                     ${errores}`);
  console.log(`🏢  Empresas actualizadas:        ${empresasActualizadas}`);
  console.log("═".repeat(64) + "\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
