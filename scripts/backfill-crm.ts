/**
 * Backfill del módulo CRM:
 *   1. Mueve 3 empresas conocidas ("no por ahora") al stage "on_hold".
 *   2. Rellena `fechaEntradaStage` en todos los CrmEstado existentes usando:
 *      - El CrmLog más reciente de tipo stage_changed/new_deal (si existe)
 *      - Si no, CrmEstado.updatedAt como aproximación
 *
 * Idempotente. Seguro de correr varias veces.
 *
 * Uso: npx tsx scripts/backfill-crm.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CIFS_ON_HOLD = ["B25233487", "B31461593", "B39327051"];

async function main() {
  // ─── Paso 1: Mover CIFs conocidos a on_hold ──────────────────────────────
  console.log("▶ Moviendo empresas a on_hold:", CIFS_ON_HOLD.join(", "));

  for (const cif of CIFS_ON_HOLD) {
    const empresa = await prisma.empresa.findUnique({
      where: { cif },
      include: { crmEstado: true },
    });

    if (!empresa) {
      console.log(`  ⚠ ${cif} no encontrada en la BD, saltando`);
      continue;
    }

    const previo = empresa.crmEstado?.dealStage ?? null;
    if (previo === "on_hold") {
      console.log(`  · ${cif} (${empresa.nombre}) ya está en on_hold`);
      continue;
    }

    const now = new Date();
    await prisma.crmEstado.upsert({
      where: { empresaId: empresa.id },
      create: {
        empresaId: empresa.id,
        dealStage: "on_hold",
        fechaEntradaStage: now,
      },
      update: {
        dealStage: "on_hold",
        fechaEntradaStage: now,
      },
    });

    await prisma.crmLog.create({
      data: {
        empresaId: empresa.id,
        event: empresa.crmEstado ? "stage_changed" : "new_deal",
        fromStage: previo,
        toStage: "on_hold",
        note: "Backfill: marcada como 'no por ahora'",
      },
    });

    console.log(`  ✓ ${cif} (${empresa.nombre}): ${previo ?? "sin CRM"} → on_hold`);
  }

  // ─── Paso 2: Backfill fechaEntradaStage en todos los CrmEstado ───────────
  console.log("\n▶ Backfill fechaEntradaStage en CrmEstado...");

  const estados = await prisma.crmEstado.findMany({
    where: { fechaEntradaStage: null },
    select: { id: true, empresaId: true, dealStage: true, updatedAt: true },
  });

  console.log(`  · ${estados.length} CrmEstado sin fechaEntradaStage`);

  let backfilledFromLog = 0;
  let backfilledFromUpdatedAt = 0;

  for (const estado of estados) {
    // Buscar último CrmLog con toStage = stage actual
    const lastLog = await prisma.crmLog.findFirst({
      where: {
        empresaId: estado.empresaId,
        toStage: estado.dealStage,
        event: { in: ["stage_changed", "new_deal"] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const fecha = lastLog?.createdAt ?? estado.updatedAt;

    await prisma.crmEstado.update({
      where: { id: estado.id },
      data: { fechaEntradaStage: fecha },
    });

    if (lastLog) backfilledFromLog++;
    else backfilledFromUpdatedAt++;
  }

  console.log(`  ✓ ${backfilledFromLog} rellenados desde CrmLog`);
  console.log(`  ✓ ${backfilledFromUpdatedAt} aproximados desde CrmEstado.updatedAt`);
  console.log("\n✅ Backfill completado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
