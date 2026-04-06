/**
 * add-empresas-manual.ts
 * Añade empresas manualmente a la BD con CIF conocido.
 * Solo inserta si el CIF no existe ya.
 *
 * Uso: npx dotenv-cli -e .env.local -- npx ts-node --compiler-options '{"module":"CommonJS","esModuleInterop":true}' scripts/add-empresas-manual.ts
 */

import { prisma } from "../src/lib/prisma";

const EMPRESAS = [
  {
    cif: "B01412816",
    nombre: "INGENIERIA DE SEGURIDAD DE VITORIA Y ALAVA SL",
    sector: "PCI",
  },
  {
    cif: "B07681794",
    nombre: "APAGAFOC SL",
    sector: "PCI",
  },
];

async function main() {
  for (const e of EMPRESAS) {
    const existing = await prisma.empresa.findUnique({ where: { cif: e.cif } });
    if (existing) {
      console.log(`⏭  Ya existe: ${e.nombre} (${e.cif}) → id=${existing.id}`);
      continue;
    }
    const created = await prisma.empresa.create({
      data: {
        cif: e.cif,
        nombre: e.nombre,
        sector: e.sector,
        enPerimetro: false,
      },
    });
    console.log(`✅ Creada: ${created.nombre} (${created.cif}) → id=${created.id}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
