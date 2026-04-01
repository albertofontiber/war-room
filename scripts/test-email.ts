/**
 * test-email.ts
 * Sends the daily summary email immediately using data from the last 7 days.
 * Useful for previewing the email design without waiting for the daily cron.
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/test-email.ts
 */

import { sendDailySummary } from "../src/lib/email-daily-summary";

async function main() {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  console.log(`📧 Sending test email (data desde ${since.toLocaleDateString("es-ES")})...`);
  const result = await sendDailySummary({ since, force: true });
  if (result.sent) {
    const fecha = since.toISOString().slice(0, 10);
    console.log("✅ Email enviado correctamente a alberto@fontiber.com");
    console.log(`🔗 Ver resumen en: https://warroom.fontiber.com/daily/${fecha}`);
  } else {
    console.log("⚠️  Error:", result.reason);
  }
}

main().catch(console.error);
