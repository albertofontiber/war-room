/**
 * Inventario de CIFs que NO están normalizados (con guiones, espacios o
 * minúsculas). Read-only por defecto. Pasa `--apply` para normalizarlos en BD.
 *
 * Normalización: `cif.replace(/[^A-Za-z0-9]/g, "").toUpperCase()`.
 *
 * Antes de aplicar: este script verifica que la versión normalizada no
 * colisione con otro CIF existente (post-merge no debería pasar, pero por
 * seguridad). Si hay colisión, lo reporta y NO toca esa fila.
 */

import { prisma } from "../src/lib/prisma";

function normCif(cif: string): string {
  return cif.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const all = await prisma.empresa.findMany({
    select: { id: true, cif: true, nombre: true },
    orderBy: { id: "asc" },
  });
  const dirty = all.filter((e) => e.cif !== normCif(e.cif));
  const cifSet = new Set(all.map((e) => e.cif));

  console.log(`\nUniverso: ${all.length} empresas`);
  console.log(`CIFs con caracteres no-alfanuméricos o lowercase: ${dirty.length}\n`);

  let updated = 0;
  let conflicts = 0;
  for (const e of dirty) {
    const next = normCif(e.cif);
    if (cifSet.has(next) && next !== e.cif) {
      console.log(`  [${e.id}] "${e.cif}" → "${next}"  ⚠️  CONFLICTO (ya existe otro con CIF normalizado)`);
      conflicts++;
      continue;
    }
    if (apply) {
      await prisma.empresa.update({ where: { id: e.id }, data: { cif: next } });
      cifSet.delete(e.cif);
      cifSet.add(next);
      updated++;
      console.log(`  [${e.id}] "${e.cif}" → "${next}"  ✅`);
    } else {
      console.log(`  [${e.id}] "${e.cif}" → "${next}"  (dry — sin --apply)`);
    }
  }

  console.log(
    `\n${apply ? "Aplicados" : "Pendientes"}: ${apply ? updated : dirty.length - conflicts}` +
      (conflicts ? `, conflictos: ${conflicts}` : "")
  );
  if (!apply) console.log(`\nPara aplicar: añade --apply al comando.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
