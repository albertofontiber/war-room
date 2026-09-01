/**
 * fix-cepreven-eurofesa.ts
 *
 * DEMCO MONTAJES SL e INTERFUEGO SEGURIDAD, S.L. fueron absorbidas por
 * Eurofesa, así que han dejado de figurar en los listados de Cepreven. Sus
 * fichas seguían marcadas como calificada y asociada respectivamente: se les
 * quita el estado para que la base diga lo mismo que la fuente.
 *
 * Dictado por Alberto el 2026-09-01, a raíz del aviso mensual de registros,
 * que las reportaba como bajas sin aplicar (el cron nunca borra estado por su
 * cuenta: lo reporta y espera a que alguien decida, que es lo que pasa aquí).
 *
 * Guard `expect` con un substring del nombre actual: si un id no corresponde
 * a quien creemos, aborta sin tocar nada.
 *
 * Dry-run por defecto. APPLY=1 para escribir.
 *
 *   npx tsx scripts/fix-cepreven-eurofesa.ts             (dry-run)
 *   APPLY=1 npx tsx scripts/fix-cepreven-eurofesa.ts     (aplica)
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.env.APPLY === "1";

/** Absorbidas por Eurofesa (A78360955). */
const ABSORBIDAS: { id: number; expect: string; motivo: string }[] = [
  { id: 843, expect: "DEMCO", motivo: "absorbida por Eurofesa" },
  { id: 1962, expect: "INTERFUEGO", motivo: "absorbida por Eurofesa" },
];

async function main() {
  console.log(APPLY ? "== APLICANDO ==" : "== SIMULACIÓN (usa APPLY=1 para escribir) ==");

  for (const { id, expect, motivo } of ABSORBIDAS) {
    const e = await prisma.empresa.findUnique({
      where: { id },
      select: { id: true, cif: true, nombre: true, cepreven: true, ceprevenAreas: true },
    });
    if (!e) throw new Error(`#${id} no existe`);
    if (!e.nombre.toUpperCase().includes(expect)) {
      throw new Error(`#${id} es "${e.nombre}", no contiene "${expect}" — abortado sin tocar nada`);
    }

    console.log(
      `#${e.id} ${e.cif} "${e.nombre}"\n` +
        `   cepreven: ${e.cepreven ?? "null"} -> null` +
        `${e.ceprevenAreas ? ` · ceprevenAreas: ${e.ceprevenAreas} -> null` : ""}\n` +
        `   motivo: ${motivo}`
    );

    if (APPLY) {
      await prisma.empresa.update({
        where: { id },
        data: { cepreven: null, ceprevenAreas: null },
      });
    }
  }

  if (APPLY) {
    const quedan = await prisma.empresa.count({
      where: { id: { in: ABSORBIDAS.map((a) => a.id) }, NOT: { cepreven: null } },
    });
    const conEstado = await prisma.empresa.count({ where: { NOT: { cepreven: null } } });
    console.log(`\nverificación: ${quedan} de las dos conservan estado (debe ser 0)`);
    console.log(`empresas con estado de Cepreven en la base: ${conEstado}`);
  }

  await prisma.$disconnect();
}
main();
