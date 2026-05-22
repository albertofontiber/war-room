/**
 * scripts/retrim-email-bodies.ts
 *
 * Re-recorta el cuerpo de los `EmailIngest` ya guardados: aplica
 * `trimQuotedThread` a `EmailIngest.body` y actualiza la fila si cambió.
 * Solo BD, sin Microsoft Graph — el texto completo ya está almacenado.
 *
 * One-off: los cuerpos poblados antes de añadir el recorte del hilo citado
 * traían toda la cadena de respuestas anteriores. Esto los deja solo con el
 * mensaje que generó la actividad. Idempotente — re-ejecutar no cambia nada
 * (recortar algo ya recortado da lo mismo).
 *
 * Usage:
 *   npx tsx scripts/retrim-email-bodies.ts            (dry-run)
 *   APPLY=1 npx tsx scripts/retrim-email-bodies.ts    (aplica)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/prisma";
import { trimQuotedThread } from "../src/lib/email-graph";

const APPLY = process.env.APPLY === "1";

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Re-recorte de cuerpos de email (${APPLY ? "APLICAR" : "DRY-RUN"})`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const rows = await prisma.emailIngest.findMany({
    where: { body: { not: null } },
    select: { id: true, subject: true, body: true },
  });
  console.log(`EmailIngest con cuerpo: ${rows.length}`);

  let changed = 0;
  let updated = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  const samples: { subject: string; before: number; after: number }[] = [];

  for (const r of rows) {
    const before = r.body ?? "";
    const after = trimQuotedThread(before);
    if (after === before) continue;

    changed++;
    bytesBefore += before.length;
    bytesAfter += after.length;
    if (samples.length < 10) {
      samples.push({
        subject: r.subject ?? "(sin asunto)",
        before: before.length,
        after: after.length,
      });
    }

    if (APPLY) {
      await prisma.emailIngest.update({
        where: { id: r.id },
        data: { body: after },
      });
      updated++;
    }
  }

  console.log(`\nCuerpos que se recortan: ${changed} de ${rows.length}`);
  if (changed > 0) {
    const pct =
      bytesBefore > 0 ? Math.round((1 - bytesAfter / bytesBefore) * 100) : 0;
    console.log(
      `Tamaño total: ${bytesBefore} → ${bytesAfter} chars (~${pct}% menos)`
    );
    console.log("\nMuestra (asunto · chars antes → después):");
    for (const s of samples) {
      console.log(`  "${s.subject.slice(0, 52)}" · ${s.before} → ${s.after}`);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (APPLY) {
    console.log(`✅ Aplicado. Cuerpos actualizados: ${updated}.`);
  } else {
    console.log(
      `✅ DRY-RUN. Para aplicar: APPLY=1 npx tsx scripts/retrim-email-bodies.ts`
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
