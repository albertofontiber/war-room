/**
 * Corrige `fechaEntradaStage` de registros que se aproximaron mal en el backfill inicial.
 *
 * Problema: el backfill puso `fechaEntradaStage = CrmEstado.updatedAt` cuando no había
 * `CrmLog` correspondiente. Pero el cron de Pipedrive hace upsert diario (aunque no cambie
 * nada), actualizando `updatedAt` sin reflejar la fecha real del cambio de stage. Esto
 * devuelve una fecha casi siempre "hoy" o de los últimos días, que es incorrecta.
 *
 * Solución: revertir a null todos los `fechaEntradaStage` que NO tengan respaldo en
 * `CrmLog` (los 146 registros aproximados del backfill anterior). Así el UI muestra
 * sinceramente "(sin dato)" en lugar de una fecha falsa. Los 24 con CrmLog real se mantienen.
 *
 * Idempotente. Uso: npx tsx scripts/fix-fecha-entrada-stage.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const estados = await prisma.crmEstado.findMany({
    where: { fechaEntradaStage: { not: null } },
    select: { id: true, empresaId: true, dealStage: true, fechaEntradaStage: true },
  });

  console.log(`▶ Revisando ${estados.length} CrmEstado con fechaEntradaStage seteada`);

  let cleaned = 0;
  let kept = 0;

  for (const estado of estados) {
    const matchingLog = await prisma.crmLog.findFirst({
      where: {
        empresaId: estado.empresaId,
        toStage: estado.dealStage,
        event: { in: ["stage_changed", "new_deal"] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (matchingLog) {
      // Usamos la fecha del log (más fiable)
      if (
        matchingLog.createdAt.getTime() !==
        estado.fechaEntradaStage!.getTime()
      ) {
        await prisma.crmEstado.update({
          where: { id: estado.id },
          data: { fechaEntradaStage: matchingLog.createdAt },
        });
      }
      kept++;
    } else {
      // Sin log real → limpiamos la fecha aproximada
      await prisma.crmEstado.update({
        where: { id: estado.id },
        data: { fechaEntradaStage: null },
      });
      cleaned++;
    }
  }

  console.log(`  ✓ ${kept} mantenidos/corregidos con fecha real de CrmLog`);
  console.log(`  ✓ ${cleaned} limpiados a null (no había fuente fiable)`);
  console.log("\n✅ Fix completado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
