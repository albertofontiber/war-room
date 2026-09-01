/**
 * Sincroniza las habilitaciones de seguridad privada desde los tres registros
 * públicos: el nacional de la Policía, el catalán y el vasco.
 *
 *   npx tsx scripts/import-habilitaciones.ts                    # simulación
 *   npx tsx scripts/import-habilitaciones.ts --apply            # escribe
 *   npx tsx scripts/import-habilitaciones.ts --pdf ruta.pdf     # PDF nacional local
 *   npx tsx scripts/import-habilitaciones.ts --euskadi ruta.pdf # PDF vasco local
 *
 * Cataluña y Euskadi tienen la competencia transferida, así que sus empresas
 * con habilitación solo autonómica NO están en el listado nacional: hay que
 * leer los tres para tener la foto completa.
 *
 * Nunca borra empresas. Las que ya no figuran en ningún registro se reportan
 * pero no se tocan.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs";
import { parseListadoPolicia } from "../src/lib/policia/parse-empresas";
import { parseRegistroEuskadi } from "../src/lib/policia/parse-euskadi";
import { fetchRegistroCatalunya } from "../src/lib/policia/fetch-catalunya";
import { ETIQUETA_HABILITACION } from "../src/lib/policia/habilitaciones";
import {
  planificaHabilitaciones,
  type EmpresaBase,
  type EmpresaRegistro,
} from "../src/lib/policia/sync";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const pdfNacional = args.includes("--pdf") ? args[args.indexOf("--pdf") + 1] : null;
const pdfEuskadi = args.includes("--euskadi") ? args[args.indexOf("--euskadi") + 1] : null;

const log = (...p: unknown[]) => console.log(...p);

/** Resume un mapa de habilitaciones en algo legible. */
function resume(h: Record<string, string | undefined>): string {
  const partes = Object.entries(h).map(
    ([k, v]) => `${ETIQUETA_HABILITACION[k] ?? k} (${v === "E" ? "estatal" : "autonómico"})`
  );
  return partes.length ? partes.join(", ") : "ninguna";
}

async function main() {
  log(APPLY ? "== APLICANDO CAMBIOS ==" : "== SIMULACIÓN (usa --apply para escribir) ==\n");

  if (!pdfNacional) {
    log("Sin --pdf: se omite el registro nacional (su URL cambia en cada edición).\n");
  }

  const nacional: EmpresaRegistro[] = pdfNacional
    ? await parseListadoPolicia(fs.readFileSync(pdfNacional))
    : [];
  log(`Registro nacional : ${nacional.length} empresas`);

  const catalunya = await fetchRegistroCatalunya();
  log(`Registro catalán  : ${catalunya.length} empresas`);

  const euskadi = await parseRegistroEuskadi(
    pdfEuskadi ? fs.readFileSync(pdfEuskadi) : undefined
  );
  log(`Registro vasco    : ${euskadi.length} empresas\n`);

  const empresas: EmpresaBase[] = await prisma.empresa.findMany({
    select: {
      id: true, cif: true, nombre: true, sector: true,
      habilitaciones: true, ambitoGeo: true, registroFuente: true,
    },
  });
  log(`Empresas en la base: ${empresas.length}\n`);

  // El orden importa: los registros autonómicos son más específicos y pisan al
  // nacional si una empresa sale en los dos.
  //
  // Sin --pdf el nacional NO se pasa, en vez de pasarlo vacío: un registro que
  // no se ha leído no dice nada, y darlo por leído daría por desaparecidas a
  // todas las empresas que salieron de él.
  const plan = planificaHabilitaciones(empresas, [
    ...(pdfNacional ? [{ registro: "policia" as const, empresas: nacional }] : []),
    { registro: "catalunya", empresas: catalunya },
    { registro: "euskadi", empresas: euskadi },
  ]);

  log(`ALTAS — instaladoras que no estaban (${plan.altas.length}):`);
  for (const a of [...plan.altas].sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))) {
    log(`  ${a.cif}  ${a.nombre}`);
    log(`      ${resume(a.habilitaciones)}  ·  registro ${a.registroFuente}`);
  }

  // Las actualizaciones que solo añaden el desglose (antes no había nada) son
  // la mayoría y no aportan nada leerlas una a una.
  const estrena = plan.actualizaciones.filter((a) => Object.keys(a.antes).length === 0);
  const cambia = plan.actualizaciones.filter((a) => Object.keys(a.antes).length > 0);

  log(`\nESTRENAN DESGLOSE — ya en la base, sin habilitaciones guardadas (${estrena.length})`);
  const porHab: Record<string, number> = {};
  for (const a of estrena) {
    for (const k of Object.keys(a.habilitaciones)) porHab[k] = (porHab[k] ?? 0) + 1;
  }
  for (const [k, n] of Object.entries(porHab).sort((x, y) => y[1] - x[1])) {
    log(`    ${(ETIQUETA_HABILITACION[k] ?? k).padEnd(30)} ${n}`);
  }

  log(`\nCAMBIAN respecto a lo guardado (${cambia.length}):`);
  for (const a of cambia.slice(0, 40)) {
    log(`  ${a.nombre}`);
    log(`      antes: ${resume(a.antes)}`);
    log(`      ahora: ${resume(a.habilitaciones)}`);
  }
  if (cambia.length > 40) log(`  … y ${cambia.length - 40} más`);

  log(`\nDESCARTADAS por no tener instalación: ${plan.descartadasSinInstalacion}`);
  log(`SIN RESPALDO — con habilitaciones pero ya no figuran (${plan.sinRespaldo.length}) · no se tocan:`);
  plan.sinRespaldo.slice(0, 15).forEach((e) => log(`  ${e.nombre}`));
  if (plan.sinRespaldo.length > 15) log(`  … y ${plan.sinRespaldo.length - 15} más`);

  const total = plan.altas.length + plan.actualizaciones.length;
  log(`\nTotal de escrituras: ${total} (${plan.altas.length} altas, ${plan.actualizaciones.length} actualizaciones)`);

  if (!APPLY) {
    log("\nSimulación: no se ha escrito nada.");
    return;
  }

  await prisma.$transaction([
    ...plan.actualizaciones.map((a) =>
      prisma.empresa.update({
        where: { id: a.id },
        data: {
          habilitaciones: a.habilitaciones as Prisma.InputJsonValue,
          ambitoGeo: a.ambitoGeo,
          registroFuente: a.registroFuente,
        },
      })
    ),
    ...plan.altas.map((a) =>
      prisma.empresa.create({
        data: {
          cif: a.cif,
          nombre: a.nombre,
          // Alta desde el registro: instaladora, dentro del perímetro.
          sector: "seguridad_electronica",
          enPerimetro: true,
          provincia: "",
          ccaa: "",
          habilitaciones: a.habilitaciones as Prisma.InputJsonValue,
          ambitoGeo: a.ambitoGeo,
          registroFuente: a.registroFuente,
          fuente: `registro_${a.registroFuente}`,
        },
      })
    ),
  ]);

  log(`\nHecho: ${total} empresas escritas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
