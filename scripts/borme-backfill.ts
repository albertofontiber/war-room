/**
 * borme-backfill.ts
 * Backfills 6 months of BORME section A alerts for all companies in the DB.
 *
 * Usage:
 *   npx tsx scripts/borme-backfill.ts
 *
 * Optional env vars:
 *   BACKFILL_MONTHS=3   — number of months to backfill (default: 6)
 *   START_DATE=20250101 — explicit start date (YYYYMMDD), overrides BACKFILL_MONTHS
 *
 * The script is idempotent: re-running it will not create duplicate alerts.
 * It processes days from newest → oldest so partial runs are useful.
 */

import {
  processBormeDate,
  workingDaysBetween,
  DAY_DELAY_MS,
} from "../src/lib/borme";

async function main() {
  const months = parseInt(process.env.BACKFILL_MONTHS ?? "6");
  const now = new Date();

  // End = yesterday (last possible BORME day)
  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() - 1);

  // Start = N months ago (or explicit START_DATE)
  let startDate: Date;
  if (process.env.START_DATE) {
    const s = process.env.START_DATE;
    startDate = new Date(
      Date.UTC(
        parseInt(s.slice(0, 4)),
        parseInt(s.slice(4, 6)) - 1,
        parseInt(s.slice(6, 8))
      )
    );
  } else {
    startDate = new Date(endDate);
    startDate.setUTCMonth(startDate.getUTCMonth() - months);
  }

  const days = workingDaysBetween(startDate, endDate);

  const startStr = days[days.length - 1];
  const endStr = days[0];
  console.log(`\n🗂️  BORME Backfill — ${months} months`);
  console.log(`   Rango: ${startStr} → ${endStr}`);
  console.log(`   Días hábiles: ${days.length}\n`);

  let totalAlertas = 0;
  let totalEmpresas = 0;
  let totalItems = 0;
  let totalErrors = 0;
  const failedDays: string[] = [];

  const t0 = Date.now();

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const pct = (((i + 1) / days.length) * 100).toFixed(0);
    process.stdout.write(`[${String(i + 1).padStart(3)}/${days.length}] ${day}  `);

    try {
      const result = await processBormeDate(day);

      totalAlertas += result.alertasCreadas;
      totalEmpresas += result.empresasEncontradas;
      totalItems += result.pdfsProcesados;
      if (result.errors.length > 0) totalErrors += result.errors.length;

      const status =
        result.pdfsProcesados === 0
          ? "⚪ sin BORME"
          : `✓  ${result.alertasCreadas} alertas  ${result.empresasEncontradas} empresas  (${result.pdfsProcesados} actos)`;

      console.log(`${status}  [${pct}%]`);

      if (result.errors.length > 0) {
        result.errors.forEach((e) => console.warn(`       ⚠️  ${e}`));
      }
    } catch (err) {
      totalErrors++;
      failedDays.push(day);
      console.log(`✗  ERROR: ${err}`);
    }

    // Pause between days to be polite to BOE servers
    if (i < days.length - 1) {
      await new Promise((r) => setTimeout(r, DAY_DELAY_MS));
    }
  }

  const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅  Backfill completado en ${elapsed} min`);
  console.log(`   PDFs procesados:       ${totalItems}`);
  console.log(`   Menciones encontradas: ${totalEmpresas}`);
  console.log(`   Alertas creadas:       ${totalAlertas}`);
  console.log(`   Errores:               ${totalErrors}`);
  if (failedDays.length > 0) {
    console.log(`   Días fallidos:         ${failedDays.join(", ")}`);
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
