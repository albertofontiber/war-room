/**
 * Inventario de empresas duplicadas en BD (read-only — no toca datos).
 *
 * Estrategia:
 *   1. Normaliza CIF (quita guiones / espacios / lowercase) y agrupa.
 *      Si el mismo CIF normalizado aparece en >1 fila, es duplicado claro.
 *   2. Normaliza nombre (uppercase, sin diacríticos, sin SL/SA/SLU/etc, sin
 *      espacios extras) y agrupa. Posibles duplicados por nombre que son
 *      empresas distintas (CIF distinto) — más casos falsos pero útiles.
 *
 * Output: muestra todos los grupos para que Alberto decida cuáles fusionar
 * y cuáles dejar (puede haber empresas con nombres parecidos legítimos).
 */

import { prisma } from "../src/lib/prisma";

function normCif(cif: string): string {
  return cif.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar diacríticos
    .toUpperCase()
    // quitar formas jurídicas comunes
    .replace(/\b(S\.?L\.?U?\.?|S\.?A\.?|SLP|SCP|SCOOP|S\.?\s*COOP\.?|SOCIEDAD\s+LIMITADA|SOCIEDAD\s+ANONIMA|SOCIEDAD\s+ANÓNIMA)\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ") // quitar puntuación
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const all = await prisma.empresa.findMany({
    select: {
      id: true,
      cif: true,
      nombre: true,
      provincia: true,
      ccaa: true,
      esAnonima: true,
      finderSourceId: true,
      crmEstado: { select: { dealStage: true } },
      _count: {
        select: {
          tareas: true,
          notas: true,
          financieros: true,
          bormeAlertas: true,
          contactos: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  console.log(`\nUniverso: ${all.length} empresas en BD.\n`);

  // ─── Duplicados por CIF normalizado ──────────────────────────────────────
  const byCif = new Map<string, typeof all>();
  for (const e of all) {
    const k = normCif(e.cif);
    if (!byCif.has(k)) byCif.set(k, []);
    byCif.get(k)!.push(e);
  }
  const cifDups = Array.from(byCif.entries())
    .filter(([_, arr]) => arr.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  CIFs DUPLICADOS (mismo CIF normalizado en >1 fila): ${cifDups.length}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  for (const [cifNorm, arr] of cifDups) {
    console.log(`  CIF normalizado: ${cifNorm}  (${arr.length} filas)`);
    for (const e of arr) {
      const richness =
        e._count.tareas +
        e._count.notas +
        e._count.financieros +
        e._count.bormeAlertas +
        e._count.contactos;
      const flags: string[] = [];
      if (e.esAnonima) flags.push("ANON");
      if (e.finderSourceId) flags.push("finder");
      if (e.crmEstado?.dealStage) flags.push(`stage=${e.crmEstado.dealStage}`);
      console.log(
        `    [${e.id}] CIF="${e.cif}" "${e.nombre}" — ` +
          `T${e._count.tareas} N${e._count.notas} F${e._count.financieros} B${e._count.bormeAlertas} C${e._count.contactos} ` +
          `(richness=${richness})${flags.length ? " · " + flags.join(", ") : ""} · ${e.provincia ?? "—"}`
      );
    }
    console.log("");
  }

  // ─── Duplicados por nombre normalizado (CIFs distintos) ──────────────────
  const byNombre = new Map<string, typeof all>();
  for (const e of all) {
    const k = normNombre(e.nombre);
    if (!k) continue;
    if (!byNombre.has(k)) byNombre.set(k, []);
    byNombre.get(k)!.push(e);
  }
  const nombreDups = Array.from(byNombre.entries())
    .filter(([_, arr]) => {
      if (arr.length < 2) return false;
      // Solo nombres distintos por CIF (si los CIFs ya están en cifDups, no lo
      // repetimos).
      const cifsNorm = new Set(arr.map((e) => normCif(e.cif)));
      return cifsNorm.size === arr.length;
    })
    .sort((a, b) => b[1].length - a[1].length);

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  NOMBRES SIMILARES con CIFs distintos: ${nombreDups.length}`);
  console.log(`  (Filtrados duplicados por CIF — aquí solo casos por nombre)`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  for (const [nombreNorm, arr] of nombreDups) {
    console.log(`  Nombre normalizado: "${nombreNorm}"  (${arr.length} filas)`);
    for (const e of arr) {
      const richness =
        e._count.tareas +
        e._count.notas +
        e._count.financieros +
        e._count.bormeAlertas +
        e._count.contactos;
      const flags: string[] = [];
      if (e.esAnonima) flags.push("ANON");
      if (e.finderSourceId) flags.push("finder");
      if (e.crmEstado?.dealStage) flags.push(`stage=${e.crmEstado.dealStage}`);
      console.log(
        `    [${e.id}] CIF="${e.cif}" "${e.nombre}" — ` +
          `T${e._count.tareas} N${e._count.notas} F${e._count.financieros} B${e._count.bormeAlertas} C${e._count.contactos} ` +
          `(richness=${richness})${flags.length ? " · " + flags.join(", ") : ""} · ${e.provincia ?? "—"}`
      );
    }
    console.log("");
  }

  console.log("Leyenda: T=tareas N=notas F=financieros B=BORMEalertas C=contactos");
  console.log("\nPara fusionar duplicados: ver scripts/merge-empresas.ts (próximo, requiere ID principal + secundario).");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
