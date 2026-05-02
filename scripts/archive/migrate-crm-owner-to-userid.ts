/**
 * Backfill ownerUserId desde el string legacy `owner` (Pipedrive).
 *
 * Pre-requisito de la Fase B del cut-over Pipedrive: antes de droppear las
 * columnas `CrmEstado.owner` y `CrmLog.owner`, mapear las filas que aún
 * dependen del string. Las filas creadas por la UI nueva ya tienen
 * `ownerUserId` poblado y se ignoran (idempotente).
 *
 * Mapping fijo:
 *   "alberto" / "Alberto Silva" → user con email alberto@fontiber.com
 *   "gabriel" / "Gabriel"       → user con email gabriel@fontiber.com
 *
 * No tocamos CrmLog: su columna `owner` es un campo histórico de auditoría
 * y se va a dropear sin migrar — esos eventos antiguos (cambios de stage
 * de Pipedrive) no necesitan ser remappeados a un User actual; el `autorId`
 * cubre los cambios desde War Room nativo.
 *
 * Dry-run por defecto. Para aplicar: `APPLY=1 npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-crm-owner-to-userid.ts`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ALBERTO_OWNERS = new Set(["alberto", "Alberto Silva", "Alberto"]);
const GABRIEL_OWNERS = new Set(["gabriel", "Gabriel"]);

async function main() {
  const apply = process.env.APPLY === "1";
  console.log(apply ? "APPLY mode (escribiendo cambios)\n" : "DRY-RUN mode (sin cambios)\n");

  const alberto = await prisma.user.findUnique({ where: { email: "alberto@fontiber.com" } });
  const gabriel = await prisma.user.findUnique({ where: { email: "gabriel@fontiber.com" } });
  if (!alberto || !gabriel) {
    throw new Error("No se encontró Alberto/Gabriel en User. Abortando.");
  }
  console.log(`Alberto = ${alberto.id}`);
  console.log(`Gabriel = ${gabriel.id}\n`);

  const candidatos = await prisma.crmEstado.findMany({
    where: { owner: { not: null }, ownerUserId: null },
    select: { id: true, empresaId: true, owner: true, dealStage: true },
  });
  console.log(`Filas candidatas: ${candidatos.length}\n`);

  const grupos: Record<string, { match: typeof candidatos; userId: string | null }> = {
    alberto: { match: [], userId: alberto.id },
    gabriel: { match: [], userId: gabriel.id },
    desconocido: { match: [], userId: null },
  };
  for (const c of candidatos) {
    const o = c.owner ?? "";
    if (ALBERTO_OWNERS.has(o)) grupos.alberto.match.push(c);
    else if (GABRIEL_OWNERS.has(o)) grupos.gabriel.match.push(c);
    else grupos.desconocido.match.push(c);
  }

  console.log("Resumen:");
  console.log(`  → Alberto: ${grupos.alberto.match.length} filas`);
  console.log(`  → Gabriel: ${grupos.gabriel.match.length} filas`);
  console.log(`  → Desconocido: ${grupos.desconocido.match.length} filas`);

  if (grupos.desconocido.match.length > 0) {
    console.log("\n⚠️  Filas con owner desconocido (no se migran):");
    for (const c of grupos.desconocido.match) {
      console.log(`    id=${c.id} empresaId=${c.empresaId} owner="${c.owner}"`);
    }
  }

  if (!apply) {
    console.log("\nDry-run: no se ha escrito nada. Ejecutar con APPLY=1 para aplicar.");
    return;
  }

  let updated = 0;
  for (const grupo of [grupos.alberto, grupos.gabriel]) {
    if (!grupo.userId || grupo.match.length === 0) continue;
    const result = await prisma.crmEstado.updateMany({
      where: { id: { in: grupo.match.map((c) => c.id) } },
      data: { ownerUserId: grupo.userId },
    });
    updated += result.count;
  }
  console.log(`\n✅ ${updated} filas actualizadas.`);

  // Verificación post-update
  const restantes = await prisma.crmEstado.count({
    where: { owner: { not: null }, ownerUserId: null },
  });
  console.log(`Restantes con owner pero sin ownerUserId: ${restantes}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
