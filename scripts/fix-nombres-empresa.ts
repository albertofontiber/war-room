/**
 * Corrige razones sociales mal guardadas.
 *
 *   npx tsx scripts/fix-nombres-empresa.ts           # simulación
 *   npx tsx scripts/fix-nombres-empresa.ts --apply   # escribe
 *
 * Dos cosas distintas:
 *
 * 1. Entidades HTML sin decodificar (`&amp;`, `&#xb7;`). Es un fallo nuestro:
 *    el nombre venía de una página web y se guardó tal cual. Se arregla
 *    mecánicamente y sin riesgo.
 *
 * 2. Erratas puntuales del propio registro. Estas NO se tocan a ciegas: solo
 *    se corrigen las que otra fuente oficial contradice, y queda anotado cuál.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const ENTIDADES: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
  ntilde: "ñ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
};

/** Decodifica `&amp;`, `&#183;`, `&#xb7;`… */
export function decodificaEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e.toLowerCase()] ?? m);
}

/**
 * Correcciones puntuales, cada una con la fuente que la respalda.
 *
 * No se corrige `S¿LECTRIC, S.L.` (B58532276): el `¿` está también en el
 * RIPCI, así que el error es del registro y no hay segunda fuente que diga
 * cuál era la letra buena. Inventarla sería peor que dejarla.
 */
const CORRECCIONES: { cif: string; nombre: string; porque: string }[] = [
  {
    cif: "B70229638",
    nombre: "HISPANIA PROTECCIÓN Y SEGURIDAD, S.L.",
    porque:
      'el RIPCI escribe "PPROTECCIÓN" con doble P, pero el registro de ' +
      "seguridad privada de la Policía la recoge bien",
  },
];

async function main() {
  console.log(APPLY ? "== APLICANDO ==\n" : "== SIMULACIÓN (usa --apply para escribir) ==\n");

  const empresas = await prisma.empresa.findMany({ select: { id: true, cif: true, nombre: true } });
  const cambios: { id: number; antes: string; despues: string; motivo: string }[] = [];

  for (const e of empresas) {
    const decodificado = decodificaEntidades(e.nombre);
    if (decodificado !== e.nombre) {
      cambios.push({
        id: e.id, antes: e.nombre, despues: decodificado,
        motivo: "entidad HTML sin decodificar",
      });
    }
  }

  for (const c of CORRECCIONES) {
    const e = empresas.find((x) => x.cif?.toUpperCase() === c.cif);
    if (!e) {
      console.log(`  aviso: no hay ninguna empresa con CIF ${c.cif}`);
      continue;
    }
    // Si ya se corrigió en una pasada anterior, no se repite.
    if (e.nombre === c.nombre) continue;
    cambios.push({ id: e.id, antes: e.nombre, despues: c.nombre, motivo: c.porque });
  }

  console.log(`Nombres a corregir: ${cambios.length}\n`);
  for (const c of cambios) {
    console.log(`  ${c.antes}`);
    console.log(`  → ${c.despues}`);
    console.log(`    (${c.motivo})\n`);
  }

  if (!APPLY) {
    console.log("Simulación: no se ha escrito nada.");
    return;
  }

  await prisma.$transaction(
    cambios.map((c) => prisma.empresa.update({ where: { id: c.id }, data: { nombre: c.despues } }))
  );
  console.log(`Hecho: ${cambios.length} nombres corregidos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
