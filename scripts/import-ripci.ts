/**
 * Aplica a la base el resultado del cruce con el RIPCI (RD 513/2017).
 *
 *   npx tsx scripts/import-ripci.ts <cruce.json>            # simulación
 *   npx tsx scripts/import-ripci.ts <cruce.json> --apply    # escribe
 *
 * Hace tres cosas:
 *   1. Guarda las categorías RIPCI —instalación y mantenimiento por separado—
 *      de todas las empresas que ya están en la base.
 *   2. Reclasifica a "mixto" las que constan como seguridad electrónica pero
 *      tienen habilitación de contra incendios.
 *   3. Da de alta las que faltan.
 *
 * El dato de partida lo produce el volcado del buscador público, que es la
 * única fuente al día: el CSV de datos abiertos del ministerio es de marzo de
 * 2021 y se quedó corto en más de mil empresas.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();

const [rutaCruce] = process.argv.slice(2);
const APPLY = process.argv.includes("--apply");
/** Qué altas se aplican: por defecto ninguna, salvo las que se pidan. */
const SOLO_CCAA = process.argv.includes("--ccaa")
  ? process.argv[process.argv.indexOf("--ccaa") + 1]
  : null;
const TODAS = process.argv.includes("--todas");

interface Registro {
  nif: string;
  titular: string;
  ccaa: string;
  instalacion: string[];
  mantenimiento: string[];
  estados: string[];
  id?: number;
  sectorBd?: string | null;
}

const log = (...p: unknown[]) => console.log(...p);

/** Fecha de alta más antigua, que viene del volcado como DD/MM/AAAA. */
function fecha(valor: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(valor ?? "");
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : null;
}

async function main() {
  const cruce = JSON.parse(fs.readFileSync(rutaCruce, "utf8")) as {
    enBd: Registro[];
    mal: Registro[];
    fuera: Registro[];
  };

  log(APPLY ? "== APLICANDO ==" : "== SIMULACIÓN (usa --apply para escribir) ==\n");

  const paquete = (r: Registro) => ({
    instalacion: r.instalacion,
    mantenimiento: r.mantenimiento,
  });

  // ── 1. Categorías de las que ya están ────────────────────────────────────
  const conCategorias = cruce.enBd.filter(
    (r) => r.id && (r.instalacion.length || r.mantenimiento.length)
  );
  log(`Categorías RIPCI a guardar en empresas existentes: ${conCategorias.length}`);

  // ── 2. Reclasificaciones ─────────────────────────────────────────────────
  log(`\nRECLASIFICAR a "mixto" (${cruce.mal.length}):`);
  for (const r of cruce.mal) {
    log(`  ${r.nif}  ${r.titular.slice(0, 42).padEnd(42)} ${r.sectorBd} -> mixto` +
        `  [${r.instalacion.length} inst · ${r.mantenimiento.length} mant]`);
  }

  // ── 3. Altas ─────────────────────────────────────────────────────────────
  const pedidas = TODAS
    ? cruce.fuera
    : SOLO_CCAA
      ? cruce.fuera.filter((r) => r.ccaa.toUpperCase() === SOLO_CCAA.toUpperCase())
      : [];

  // Guarda contra el doble alta: el CIF es único, así que una empresa metida en
  // una pasada anterior haría fallar la transacción entera.
  const yaEstan = new Set(
    (
      await prisma.empresa.findMany({
        where: { cif: { in: pedidas.map((r) => r.nif) } },
        select: { cif: true },
      })
    ).map((e) => (e.cif ?? "").toUpperCase())
  );
  const altas = pedidas.filter((r) => !yaEstan.has(r.nif.toUpperCase()));

  log(
    `\nALTAS${TODAS ? " (todas)" : SOLO_CCAA ? ` de ${SOLO_CCAA}` : " (ninguna: usa --todas o --ccaa)"}: ` +
      `${altas.length}` +
      (yaEstan.size ? `  ·  ${yaEstan.size} ya estaban de una pasada anterior` : "")
  );
  for (const r of altas.slice(0, 50)) {
    log(`  ${r.nif}  ${r.titular.slice(0, 46).padEnd(46)} [${r.instalacion.length} inst · ${r.mantenimiento.length} mant]`);
  }
  if (altas.length > 50) log(`  … y ${altas.length - 50} más`);

  log(`\nTotal de escrituras: ${conCategorias.length + cruce.mal.length + altas.length}`);

  if (!APPLY) {
    log("\nSimulación: no se ha escrito nada.");
    return;
  }

  // Las categorías van en tandas: son miles de updates y una sola transacción
  // con todo dentro agota el tiempo de la conexión.
  const TANDA = 200;
  for (let i = 0; i < conCategorias.length; i += TANDA) {
    await prisma.$transaction(
      conCategorias.slice(i, i + TANDA).map((r) =>
        prisma.empresa.update({
          where: { id: r.id },
          data: { ripci: paquete(r) as Prisma.InputJsonValue },
        })
      )
    );
  }
  log(`Categorías guardadas: ${conCategorias.length}`);

  await prisma.$transaction([
    ...cruce.mal.map((r) =>
      prisma.empresa.update({
        where: { id: r.id },
        data: { sector: "mixto", ripci: paquete(r) as Prisma.InputJsonValue },
      })
    ),
    ...altas.map((r) =>
      prisma.empresa.create({
        data: {
          cif: r.nif,
          nombre: r.titular,
          // Tienen habilitación de contra incendios: entran como PCI.
          sector: "PCI",
          enPerimetro: true,
          provincia: "",
          ccaa: r.ccaa,
          ripci: paquete(r) as Prisma.InputJsonValue,
          fuente: "ripci",
        },
      })
    ),
  ]);

  log(`Reclasificadas: ${cruce.mal.length} · Altas: ${altas.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
