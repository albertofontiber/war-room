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
import { cruza, type EmpresaBase } from "../src/lib/cepreven/match";

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

  const empresas: EmpresaBase[] = await prisma.empresa.findMany({
    select: { id: true, cif: true, nombre: true },
  });
  log(`Empresas en la base: ${empresas.length}\n`);

  // ── Calificadas ────────────────────────────────────────────────────────
  const listado = await parseListadoCepreven(await cargaPdf());
  log(`Calificadas en el PDF: ${listado.empresas.length} en ${listado.areasVistas.length} áreas`);

  const califCruce = cruza(listado.empresas, empresas, (e) => e.nombre);
  log(`  casadas: ${califCruce.casados.length} | sin casar: ${califCruce.sinCasar.length}`);
  for (const e of califCruce.sinCasar) log(`    sin casar: ${e.nombre}`);

  // Una empresa puede figurar dos veces con grafías distintas (el PDF trae
  // "AIR FEU, S.L." y "AIRFEU, S.L."): se acumulan sus áreas.
  const areasPorEmpresa = new Map<number, Set<string>>();
  for (const { origen, empresa } of califCruce.casados) {
    const set = areasPorEmpresa.get(empresa.id) ?? new Set<string>();
    for (const a of origen.areas) set.add(a);
    areasPorEmpresa.set(empresa.id, set);
  }
  log(`  empresas distintas: ${areasPorEmpresa.size}\n`);

  // ── Asociadas ──────────────────────────────────────────────────────────
  const asociadas = (await fetchAsociados()).filter((e) => !e.institucional);
  log(`Asociadas en la web: ${asociadas.length} (sin contar miembros institucionales)`);

  const asocCruce = cruza(asociadas, empresas, (e) => e.nombre);
  log(`  casadas: ${asocCruce.casados.length} | sin casar: ${asocCruce.sinCasar.length}\n`);

  // ── Estado objetivo ────────────────────────────────────────────────────
  const objetivo = new Map<number, { cepreven: string; areas: string[] | null }>();
  for (const { empresa } of asocCruce.casados) {
    objetivo.set(empresa.id, { cepreven: "asociada", areas: null });
  }
  // Se aplica después para que "calificada" pise a "asociada".
  for (const [id, areas] of areasPorEmpresa) {
    objetivo.set(id, { cepreven: "calificada", areas: [...areas].sort() });
  }

  const actuales = await prisma.empresa.findMany({
    where: { OR: [{ cepreven: { not: null } }, { id: { in: [...objetivo.keys()] } }] },
    select: { id: true, nombre: true, cepreven: true, ceprevenAreas: true },
  });

  const altas: string[] = [];
  const cambios: string[] = [];
  const bajas: string[] = [];
  // Pasar de "calificada" a "asociada" casi siempre significa que el cruce ha
  // fallado, no que la empresa haya perdido la calificación. Se aparta para
  // mirarlo antes de escribir.
  const degradaciones: string[] = [];
  const escrituras: { id: number; cepreven: string | null; ceprevenAreas: string | null }[] = [];

  for (const emp of actuales) {
    const quiere = objetivo.get(emp.id);
    const areasActuales = emp.ceprevenAreas ?? null;
    const areasNuevas = quiere?.areas ? JSON.stringify(quiere.areas) : null;

    if (!quiere) {
      // No se escribe salvo que se pida con --con-bajas. Una empresa deja de
      // aparecer en el cruce por dos motivos muy distintos: porque ha salido
      // del listado, o porque su nombre en la base no casa con el de la
      // fuente. Lo segundo es frecuente (abreviaturas, erratas) y borrar el
      // estado por eso es una pérdida de dato silenciosa.
      if (emp.cepreven) {
        bajas.push(`  ${emp.nombre} (era ${emp.cepreven})`);
        if (CON_BAJAS) escrituras.push({ id: emp.id, cepreven: null, ceprevenAreas: null });
      }
      continue;
    }

    if (emp.cepreven === quiere.cepreven && areasActuales === areasNuevas) continue;

    const detalle = quiere.areas ? ` [${quiere.areas.length} áreas]` : "";
    if (emp.cepreven === "calificada" && quiere.cepreven === "asociada") {
      degradaciones.push(`  ${emp.nombre}: calificada -> asociada`);
      continue; // no se escribe
    }
    if (!emp.cepreven) altas.push(`  ${emp.nombre} -> ${quiere.cepreven}${detalle}`);
    else cambios.push(`  ${emp.nombre}: ${emp.cepreven} -> ${quiere.cepreven}${detalle}`);

    escrituras.push({ id: emp.id, cepreven: quiere.cepreven, ceprevenAreas: areasNuevas });
  }

  log(`ALTAS (${altas.length}):`);
  altas.sort().forEach((l) => log(l));
  log(`\nCAMBIOS (${cambios.length}):`);
  cambios.sort().forEach((l) => log(l));
  log(
    `\nBAJAS — ya no figuran en los listados (${bajas.length})${
      CON_BAJAS ? "" : " · NO se aplican; usa --con-bajas tras revisarlas"
    }:`
  );
  bajas.sort().forEach((l) => log(l));
  log(`\nDEGRADACIONES NO APLICADAS — revisar el cruce (${degradaciones.length}):`);
  degradaciones.sort().forEach((l) => log(l));

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
