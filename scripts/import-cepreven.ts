/**
 * Sincroniza el estado Cepreven de las empresas con las dos fuentes públicas:
 * el PDF de empresas CALIFICADAS y la página de empresas ASOCIADAS.
 *
 *   npx tsx scripts/import-cepreven.ts                  # simulación (por defecto)
 *   npx tsx scripts/import-cepreven.ts --apply          # escribe en la base
 *   npx tsx scripts/import-cepreven.ts --pdf ruta.pdf   # PDF local en vez de descargarlo
 *
 * Reglas de negocio:
 * - "calificada" es un rango superior a "asociada" y la sustituye: una empresa
 *   que esté en los dos listados queda como calificada.
 * - Las áreas de calificación (rociadores de riesgo ordinario, detección…) se
 *   guardan en `ceprevenAreas` como JSON.
 * - Los miembros institucionales del listado de asociadas (UNESPA, SICUR,
 *   Tecnifuego…) no son empresas del sector y se descartan.
 *
 * Nunca borra empresas. Lo único que quita es el estado Cepreven de las que
 * han dejado de figurar en los listados, y lo avisa una a una.
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import { parseListadoCepreven } from "../src/lib/cepreven/parse-listado";
import { fetchAsociados } from "../src/lib/cepreven/parse-asociados";
import {
  escriturasSeguras,
  planificaSync,
  type EmpresaEstado,
  type Escritura,
} from "../src/lib/cepreven/sync";

const prisma = new PrismaClient();

const URL_PDF_BASE = "https://www.calificacioncepreven.com";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const CON_BAJAS = args.includes("--con-bajas");
const pdfLocal = args[args.indexOf("--pdf") + 1];

function log(...partes: unknown[]) {
  console.log(...partes);
}

/** Descarga el PDF de calificadas vigente, o lee el que se pase por parámetro. */
async function cargaPdf(): Promise<Buffer> {
  if (pdfLocal && args.includes("--pdf")) {
    log(`PDF local: ${pdfLocal}`);
    return fs.readFileSync(pdfLocal);
  }

  // La portada enlaza el listado vigente; el nombre del fichero lleva el
  // número de edición, que sube en cada actualización.
  const portada = await fetch(`${URL_PDF_BASE}/Descarga-Documentos.html`, {
    headers: { "User-Agent": "war-room/1.0 (+contacto@fontiber.com)" },
  });
  if (!portada.ok) throw new Error(`HTTP ${portada.status} al abrir la portada`);

  const html = await portada.text();
  const enlace = [...html.matchAll(/href="([^"]*Listado[^"]*\.pdf)"/gi)].map(
    (m) => m[1]
  )[0];
  if (!enlace) throw new Error("No se encontró el enlace al listado en la portada");

  const url = new URL(enlace.replace(/ /g, "%20"), `${URL_PDF_BASE}/`).toString();
  log(`PDF: ${decodeURIComponent(url)}`);

  const res = await fetch(url, {
    headers: { "User-Agent": "war-room/1.0 (+contacto@fontiber.com)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el PDF`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  log(APPLY ? "== APLICANDO CAMBIOS ==" : "== SIMULACIÓN (usa --apply para escribir) ==");

  const empresas: EmpresaEstado[] = await prisma.empresa.findMany({
    select: { id: true, cif: true, nombre: true, cepreven: true, ceprevenAreas: true },
  });
  log(`Empresas en la base: ${empresas.length}\n`);

  const listado = await parseListadoCepreven(await cargaPdf());
  log(`Calificadas en el PDF: ${listado.empresas.length} en ${listado.areasVistas.length} áreas`);

  const asociadas = await fetchAsociados();
  const deSector = asociadas.filter((e) => !e.institucional);
  log(`Asociadas en la web: ${deSector.length} (sin contar miembros institucionales)\n`);

  // El plan lo calcula la misma función que usa el cron semanal.
  const plan = planificaSync(empresas, listado.empresas, asociadas);

  log(`Sin casar — calificadas (${plan.sinCasar.calificadas.length}):`);
  plan.sinCasar.calificadas.forEach((n) => log(`  ${n}`));
  log(`Sin casar — asociadas: ${plan.sinCasar.asociadas.length}\n`);

  const detalle = (e: Escritura) => {
    if (!e.ceprevenAreas) return "";
    const n = (JSON.parse(e.ceprevenAreas) as string[]).length;
    return ` [${n} ${n === 1 ? "área" : "áreas"}]`;
  };

  log(`ALTAS (${plan.altas.length}):`);
  plan.altas
    .map((e) => `  ${e.nombre} -> ${e.cepreven}${detalle(e)}`)
    .sort()
    .forEach((l) => log(l));

  log(`\nCAMBIOS (${plan.cambios.length}):`);
  plan.cambios
    .map((e) => `  ${e.nombre} -> ${e.cepreven}${detalle(e)}`)
    .sort()
    .forEach((l) => log(l));

  log(
    `\nBAJAS — ya no figuran en los listados (${plan.bajas.length})${
      CON_BAJAS ? "" : " · NO se aplican; usa --con-bajas tras revisarlas"
    }:`
  );
  plan.bajas
    .map((e) => `  ${e.nombre}`)
    .sort()
    .forEach((l) => log(l));

  log(`\nDEGRADACIONES NO APLICADAS — revisar el cruce (${plan.degradaciones.length}):`);
  plan.degradaciones
    .map((e) => `  ${e.nombre}: calificada -> asociada`)
    .sort()
    .forEach((l) => log(l));

  const escrituras = [
    ...escriturasSeguras(plan),
    ...(CON_BAJAS ? plan.bajas : []),
  ];
  log(`\nTotal de escrituras: ${escrituras.length}`);

  if (!APPLY) {
    log("\nSimulación: no se ha escrito nada.");
    return;
  }

  // Una transacción para que un fallo a media tanda no deje la tabla
  // con unas empresas actualizadas y otras no.
  await prisma.$transaction(
    escrituras.map((e) =>
      prisma.empresa.update({
        where: { id: e.id },
        data: { cepreven: e.cepreven, ceprevenAreas: e.ceprevenAreas },
      })
    )
  );
  log(`\nHecho: ${escrituras.length} empresas actualizadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
