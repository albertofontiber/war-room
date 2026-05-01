/**
 * detect-cron-reversions.ts
 *
 * Detecta empresas donde el cron Pipedrive ha revertido un cambio manual de
 * dealStage hecho por un admin del war room. Patrón:
 *   1. Admin cambia stage A→B (CrmLog.autorId IS NOT NULL)
 *   2. Cron posterior cambia B→A (CrmLog.autorId IS NULL AND autorFinderId IS NULL)
 *
 * Lista las afectadas con su último estado manual conocido para poder restaurarlas.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = {
  empresaId: number;
  nombre: string;
  cif: string;
  manualTo: string;
  cronRevertedTo: string;
  manualAt: string;
  cronAt: string;
};

async function main() {
  const rows = await prisma.$queryRaw<Row[]>`
    WITH ordered AS (
      SELECT
        "empresaId",
        event,
        "fromStage",
        "toStage",
        "autorId",
        "autorFinderId",
        "createdAt",
        LAG("toStage") OVER (PARTITION BY "empresaId" ORDER BY "createdAt") AS "prevTo",
        LAG("autorId") OVER (PARTITION BY "empresaId" ORDER BY "createdAt") AS "prevAutor"
      FROM "CrmLog"
      WHERE event = 'stage_changed' AND "createdAt" > NOW() - INTERVAL '60 days'
    )
    SELECT
      o."empresaId",
      e.nombre,
      e.cif,
      o."prevTo" AS "manualTo",
      o."toStage" AS "cronRevertedTo",
      LAG(o."createdAt") OVER (PARTITION BY o."empresaId" ORDER BY o."createdAt")::text AS "manualAt",
      o."createdAt"::text AS "cronAt"
    FROM ordered o
    JOIN "Empresa" e ON e.id = o."empresaId"
    WHERE
      o."autorId" IS NULL
      AND o."autorFinderId" IS NULL
      AND o."prevAutor" IS NOT NULL
      AND o."toStage" = o."prevTo" -- el cron revierte al stage donde estaba antes del manual? No, queremos el revés
    ORDER BY o."createdAt" DESC
  `;

  // El filtro correcto es: el cron deshace el cambio manual = cron toStage == manual fromStage
  // Re-fetch con la lógica correcta
  const rows2 = await prisma.$queryRaw<Row[]>`
    WITH ordered AS (
      SELECT
        "empresaId",
        event,
        "fromStage",
        "toStage",
        "autorId",
        "autorFinderId",
        "createdAt",
        LAG("toStage") OVER (PARTITION BY "empresaId" ORDER BY "createdAt") AS "prevTo",
        LAG("fromStage") OVER (PARTITION BY "empresaId" ORDER BY "createdAt") AS "prevFrom",
        LAG("autorId") OVER (PARTITION BY "empresaId" ORDER BY "createdAt") AS "prevAutor",
        LAG("createdAt") OVER (PARTITION BY "empresaId" ORDER BY "createdAt") AS "prevAt"
      FROM "CrmLog"
      WHERE event = 'stage_changed' AND "createdAt" > NOW() - INTERVAL '60 days'
    )
    SELECT
      o."empresaId",
      e.nombre,
      e.cif,
      o."prevTo" AS "manualTo",
      o."toStage" AS "cronRevertedTo",
      o."prevAt"::text AS "manualAt",
      o."createdAt"::text AS "cronAt"
    FROM ordered o
    JOIN "Empresa" e ON e.id = o."empresaId"
    WHERE
      o."autorId" IS NULL
      AND o."autorFinderId" IS NULL
      AND o."prevAutor" IS NOT NULL
      AND o."fromStage" = o."prevTo"
      AND o."toStage" = o."prevFrom"
    ORDER BY o."createdAt" DESC
  `;

  // Deduplicate por empresaId — quedarnos con la reversión más reciente.
  const uniq = new Map<number, Row>();
  for (const r of rows2) {
    if (!uniq.has(r.empresaId)) uniq.set(r.empresaId, r);
  }
  const items = Array.from(uniq.values());

  console.log(`Empresas con reversión cron sobre cambio manual (últimos 60d):`);
  console.log(`Total reversiones detectadas: ${rows2.length}`);
  console.log(`Empresas distintas: ${items.length}\n`);

  for (const r of items) {
    console.log(`${r.cif.padEnd(12)} | ${r.nombre.slice(0, 40).padEnd(40)} | manual: ${r.manualTo} → cron revirtió a: ${r.cronRevertedTo} (manual ${r.manualAt.slice(0, 16)}, cron ${r.cronAt.slice(0, 16)})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
