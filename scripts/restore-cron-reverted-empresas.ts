/**
 * restore-cron-reverted-empresas.ts
 *
 * Restaura el dealStage manual de las 8 empresas que el cron de Pipedrive
 * sobrescribió en los últimos 60 días (ver detect-cron-reversions.ts).
 *
 * Para cada empresa:
 *   1. Lee el último CrmLog manual (autorId IS NOT NULL) para conocer el
 *      stage que el admin quería.
 *   2. Si el stage actual difiere → actualiza CrmEstado.dealStage.
 *   3. Crea un CrmLog event=stage_changed con autorId del admin original y
 *      nota explicando la restauración.
 *
 * Uso:
 *   npx tsx scripts/restore-cron-reverted-empresas.ts          # dry-run
 *   APPLY=1 npx tsx scripts/restore-cron-reverted-empresas.ts  # ejecuta
 *
 * IMPORTANTE: ejecutar SOLO una vez, después de pausar el cron Pipedrive
 * (vercel.json). Si el cron sigue activo, los cambios se revierten esta misma
 * noche a las 20:00 UTC.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Las 8 empresas detectadas por scripts/detect-cron-reversions.ts el 2026-05-01.
// Hardcoded: la query del detector vuelve a ejecutarse abajo para validar el
// estado real ANTES de actuar — si el stage actual ya es el correcto, skip.
const CIFS = [
  "B25233487", // SIEF 2 SL
  "B20713939", // ISART INST. Y EQUIP. DE SEGURIDAD
  "B31461593", // EXTINIRUÑA SL
  "B39327051", // COSMOS PROTECCION CONTRA INCENDIOS
  "B84194034", // INGENIERIA Y CONSERVACION CONTRAINCENDIO
  "B98904295", // FIREFCO
  "B81296949", // 3F INGENIERIA MANTENIMIENTOS
  "B74393307", // FIRE CONTROL PROTECT SYSTEM
];

async function main() {
  const apply = process.env.APPLY === "1";

  for (const cif of CIFS) {
    const empresa = await prisma.empresa.findFirst({
      where: { cif },
      select: {
        id: true,
        nombre: true,
        crmEstado: { select: { dealStage: true } },
        crmLogs: {
          where: { event: "stage_changed", autorId: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { autorId: true, toStage: true, createdAt: true, autor: { select: { name: true } } },
        },
      },
    });

    if (!empresa) {
      console.log(`[skip] ${cif}: no encontrada`);
      continue;
    }

    const ultimoManual = empresa.crmLogs[0];
    if (!ultimoManual) {
      console.log(`[skip] ${cif} (${empresa.nombre}): sin CrmLog manual previo`);
      continue;
    }

    const stageActual = empresa.crmEstado?.dealStage ?? null;
    const stageDeseado = ultimoManual.toStage;

    if (stageActual === stageDeseado) {
      console.log(`[ok ] ${cif} (${empresa.nombre}): ya en ${stageActual}`);
      continue;
    }

    console.log(
      `[${apply ? "exec" : "dry "}] ${cif} (${empresa.nombre}): ${stageActual} → ${stageDeseado} (autor original: ${ultimoManual.autor?.name ?? ultimoManual.autorId})`
    );

    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      await tx.crmEstado.update({
        where: { empresaId: empresa.id },
        data: { dealStage: stageDeseado },
      });
      await tx.crmLog.create({
        data: {
          empresaId: empresa.id,
          event: "stage_changed",
          fromStage: stageActual,
          toStage: stageDeseado,
          autorId: ultimoManual.autorId,
          note: `Restaurado tras pausar cron Pipedrive (cron había sobrescrito el cambio manual del ${ultimoManual.createdAt.toISOString().slice(0, 10)})`,
        },
      });
    });
  }

  console.log(`\n${apply ? "✓ Restauración completada." : "Dry-run. Ejecuta con APPLY=1 para aplicar."}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
