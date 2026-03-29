/**
 * borme-test-api.ts
 * Quick smoke-test for the APIspain BORME integration.
 * Usage: APISPAIN_KEY=<your_key> npx tsx scripts/borme-test-api.ts
 *
 * Fetches yesterday's acts and prints a summary.
 * No database writes — read-only.
 */

import { fetchActosByDate, lastWorkdays } from "../src/lib/borme";

async function main() {
  if (!process.env.APISPAIN_KEY) {
    console.error("❌  APISPAIN_KEY env var not set.");
    console.error("    Usage: APISPAIN_KEY=<key> npx tsx scripts/borme-test-api.ts");
    process.exit(1);
  }

  const [dateStr] = lastWorkdays(1);
  const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

  console.log(`\n🔍  Probando APIspain BORME para ${isoDate}\n`);

  try {
    const actos = await fetchActosByDate(isoDate);

    if (actos.length === 0) {
      console.log("⚠️  Sin actos para este día (festivo / fin de semana / sin datos).");
      return;
    }

    console.log(`✅  ${actos.length} actos recibidos de APIspain\n`);

    // Show distribution by tipoActo
    const byTipo: Record<string, number> = {};
    for (const a of actos) {
      byTipo[a.tipoActo] = (byTipo[a.tipoActo] ?? 0) + 1;
    }
    console.log("── Distribución por tipo:");
    Object.entries(byTipo)
      .sort((a, b) => b[1] - a[1])
      .forEach(([tipo, n]) => console.log(`   ${tipo.padEnd(20)} ${n}`));

    // Show first 5 acts as sample
    console.log("\n── Primeros 5 actos:");
    actos.slice(0, 5).forEach((a) => {
      console.log(`   NIF: ${a.nif}  tipo: ${a.tipoActo}  bormeId: ${a.bormeId}`);
      console.log(`   desc: ${a.descripcion.slice(0, 100)}`);
      console.log();
    });
  } catch (err) {
    console.error("❌  Error:", err);
    process.exit(1);
  }
}

main().catch(console.error);
