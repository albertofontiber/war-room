/**
 * Re-geocodifica empresas con dirección o CP que no fueron procesadas
 * en el re-geocoding anterior (id > 3125).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DELAY_MS = 1100;

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
}): Promise<GeoResult | null> {
  const { direccion, codigoPostal, localidad, provincia } = empresa;

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

  // Nivel 3: localidad + provincia (fallback)
  if (localidad && provincia) {
    const coords = await nominatim(`${localidad}, ${provincia}`);
    if (coords) return { ...coords, nivel: "localidad" };
  }

  return null;
}

async function main() {
  const empresas = await prisma.empresa.findMany({
    where: {
      id: { gt: 3125 },
      OR: [
        { direccion: { not: null } },
        { codigoPostal: { not: null } },
      ],
    },
    select: {
      id: true,
      nombre: true,
      direccion: true,
      codigoPostal: true,
      localidad: true,
      provincia: true,
    },
    orderBy: { id: "asc" },
  });

  console.log(`\n📍  ${empresas.length} empresas a re-geocodificar (id > 3125, con dir o CP)`);
  console.log(`⏱️   Tiempo estimado: ~${Math.ceil((empresas.length * DELAY_MS) / 60000)} min\n`);

  const stats = { direccion: 0, cp: 0, localidad: 0, sinResultado: 0, errores: 0 };
  let actualizadas = 0;

  for (let i = 0; i < empresas.length; i++) {
    const emp = empresas[i];
    await sleep(DELAY_MS);

    try {
      const result = await geocodeEmpresa(emp);

      if (result) {
        stats[result.nivel as keyof typeof stats]++;
        actualizadas++;

        await prisma.empresa.update({
          where: { id: emp.id },
          data: { lat: result.lat, lng: result.lng },
        });

        const icon = result.nivel === "direccion" ? "📍" : result.nivel === "cp" ? "📮" : "🏘️";
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
      console.error(`\n💥  Error en ${emp.nombre}:`, err);
    }
  }

  console.log("\n\n" + "═".repeat(50));
  console.log("RESUMEN RE-GEOCODING");
  console.log("═".repeat(50));
  console.log(`📍  Dirección (nivel calle):  ${stats.direccion}`);
  console.log(`📮  Código postal:            ${stats.cp}`);
  console.log(`🏘️   Localidad (fallback):     ${stats.localidad}`);
  console.log(`❌  Sin resultado:            ${stats.sinResultado}`);
  if (stats.errores) console.log(`💥  Errores:                  ${stats.errores}`);
  console.log(`🏢  Actualizadas:             ${actualizadas}`);
  console.log("═".repeat(50) + "\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
