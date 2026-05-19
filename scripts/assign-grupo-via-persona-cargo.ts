/**
 * assign-grupo-via-persona-cargo.ts
 *
 * Asigna `Empresa.grupoId` basándose en las personas clave catalogadas en
 * `lib/borme-senales.ts` cuando aparezcan como administradores VIGENTES en
 * `PersonaCargo`.
 *
 * Caso de uso: tras añadir personas nuevas al catálogo (ej. PR #126 con
 * GRUFAEM y ONIELFA PEREZ XAVIER en Plana Fàbrega), el cron BORME solo
 * aplica al procesar NUEVOS actos. Las empresas históricas donde aparece
 * esa persona ya no disparan reclasificación. Este script las reclasifica
 * de forma retroactiva usando PersonaCargo (ya tiene los administradores
 * vigentes parseados — no requiere re-procesar BORMEs).
 *
 * Reglas de asignación (NO sobreescribe nada por defecto):
 *   - `grupoId == null`                  → ASIGNAR al grupo detectado
 *   - `grupoId == grupo correcto`        → SKIP (ya está bien)
 *   - `grupoId == OTRO grupo`            → REPORTAR conflicto, NO tocar
 *                                          (puede ser asignación manual
 *                                          deliberada — requiere revisión)
 *
 * Modos:
 *   npx tsx scripts/assign-grupo-via-persona-cargo.ts          (dry-run)
 *   APPLY=1 npx tsx scripts/assign-grupo-via-persona-cargo.ts  (aplica)
 *
 * El dry-run lista exactamente qué se cambiaría sin tocar la BD.
 */

import { prisma } from "../src/lib/prisma";
import { GRUPOS_SENALES } from "../src/lib/borme-senales";

const APPLY = process.env.APPLY === "1";

interface EmpresaMatch {
  empresaId: number;
  empresaNombre: string;
  empresaCif: string;
  grupoIdActual: number | null;
  personaMatched: string;
  rol: string | null;
  fuente: string;
}

async function main() {
  console.log(
    APPLY
      ? "🛠️  Modo APLICAR — los cambios se persistirán en BD."
      : "🔍 Modo dry-run — no se modifica nada. Usa `APPLY=1` para aplicar."
  );
  console.log("");

  let totalAsignar = 0;
  let totalSkip = 0;
  let totalConflicto = 0;
  const conflictos: Array<{ grupo: string; empresa: string; grupoActual: string }> = [];

  for (const cat of GRUPOS_SENALES) {
    if (cat.personas.length === 0) continue;

    // Resolver el grupoId del catálogo en BD.
    const grupoBD = await prisma.grupo.findFirst({
      where: { nombre: cat.grupoNombre },
      select: { id: true, nombre: true },
    });

    console.log(
      `\n━━━ ${cat.grupoNombre} ${grupoBD ? `(Grupo.id=${grupoBD.id})` : "(NO existe en BD)"} ━━━`
    );
    if (!grupoBD) {
      console.log(
        `  ⚠️  Para poder asignar empresas, hay que crear primero el Grupo "${cat.grupoNombre}" en BD.`
      );
      console.log(
        `  Continuamos el análisis para mostrar matches encontrados (no se aplica nada hasta crear el grupo).`
      );
    }

    // Buscar todas las empresas con cualquiera de las personas clave del catálogo.
    // `nombreNorm` puede coincidir exacto (caso de persona jurídica como "GRUFAEM"
    // que ya está normalizada igual) o `nombreOrig` puede contener el string como
    // substring (para personas físicas con variantes de orden).
    const matchesPorEmpresa = new Map<number, EmpresaMatch>();

    for (const persona of cat.personas) {
      const cargos = await prisma.personaCargo.findMany({
        where: {
          vigente: true,
          OR: [
            { nombreNorm: persona },
            { nombreNorm: { contains: persona, mode: "insensitive" } },
            { nombreOrig: { contains: persona, mode: "insensitive" } },
          ],
        },
        select: {
          empresaId: true,
          nombreNorm: true,
          nombreOrig: true,
          rol: true,
          fuente: true,
          empresa: {
            select: { id: true, nombre: true, cif: true, grupoId: true },
          },
        },
      });

      for (const c of cargos) {
        // Dedup: si una empresa aparece por varias personas del mismo grupo,
        // nos quedamos con el primer match (el orden no importa para asignar).
        if (matchesPorEmpresa.has(c.empresaId)) continue;
        matchesPorEmpresa.set(c.empresaId, {
          empresaId: c.empresaId,
          empresaNombre: c.empresa.nombre,
          empresaCif: c.empresa.cif,
          grupoIdActual: c.empresa.grupoId,
          personaMatched: c.nombreOrig || c.nombreNorm,
          rol: c.rol,
          fuente: c.fuente,
        });
      }
    }

    if (matchesPorEmpresa.size === 0) {
      console.log(
        `  (sin matches VIGENTES en PersonaCargo para [${cat.personas.join(", ")}])`
      );
      // Diagnóstico: ¿hay entradas no-vigentes para esas personas? Útil para
      // detectar el caso "la persona aparece en BORME/scrape pero está marcada
      // como cesada" — eso significa que no se asignará el grupo por este
      // script, pero quizá hay que mirarlo manualmente.
      for (const persona of cat.personas) {
        const noVigentes = await prisma.personaCargo.count({
          where: {
            vigente: false,
            OR: [
              { nombreNorm: persona },
              { nombreNorm: { contains: persona, mode: "insensitive" } },
              { nombreOrig: { contains: persona, mode: "insensitive" } },
            ],
          },
        });
        if (noVigentes > 0) {
          console.log(
            `    ℹ  "${persona}" aparece en ${noVigentes} cargo(s) NO vigentes — los administradores que tenían esta persona ya cesaron.`
          );
        }
      }
      continue;
    }

    // Clasificar matches y aplicar reglas.
    const asignar: EmpresaMatch[] = [];
    const skip: EmpresaMatch[] = [];
    const conflicto: EmpresaMatch[] = [];

    for (const m of matchesPorEmpresa.values()) {
      if (m.grupoIdActual === null) asignar.push(m);
      else if (grupoBD && m.grupoIdActual === grupoBD.id) skip.push(m);
      else conflicto.push(m);
    }

    console.log(
      `  ${matchesPorEmpresa.size} empresa(s) con persona clave del grupo:`
    );
    console.log(`    → ${asignar.length} ASIGNAR (grupoId=null actualmente)`);
    console.log(`    → ${skip.length} ya en ${cat.grupoNombre} (skip)`);
    console.log(
      `    → ${conflicto.length} en OTRO grupo (NO tocar, reportar)`
    );

    if (asignar.length > 0) {
      console.log("");
      console.log("    Empresas a asignar:");
      for (const m of asignar) {
        console.log(
          `      [${m.empresaId}] ${m.empresaNombre} (CIF ${m.empresaCif}) — via "${m.personaMatched}" (${m.rol ?? "—"}, fuente=${m.fuente})`
        );
      }
    }

    if (conflicto.length > 0) {
      console.log("");
      console.log("    ⚠️  Empresas con conflicto (en otro grupo ya):");
      for (const m of conflicto) {
        const grupoOtro = await prisma.grupo.findUnique({
          where: { id: m.grupoIdActual! },
          select: { nombre: true },
        });
        const grupoOtroNombre = grupoOtro?.nombre ?? `(id=${m.grupoIdActual})`;
        console.log(
          `      [${m.empresaId}] ${m.empresaNombre} (CIF ${m.empresaCif}) — actual: "${grupoOtroNombre}", detectado: "${cat.grupoNombre}" via "${m.personaMatched}"`
        );
        conflictos.push({
          grupo: cat.grupoNombre,
          empresa: m.empresaNombre,
          grupoActual: grupoOtroNombre,
        });
      }
    }

    totalAsignar += asignar.length;
    totalSkip += skip.length;
    totalConflicto += conflicto.length;

    // APLICAR (solo si el grupoBD existe — si no, las asignaciones quedan
    // pendientes hasta que el usuario cree el Grupo desde la UI).
    if (APPLY && grupoBD && asignar.length > 0) {
      console.log("");
      console.log(`  Aplicando ${asignar.length} asignaciones...`);
      let aplicadas = 0;
      for (const m of asignar) {
        await prisma.empresa.update({
          where: { id: m.empresaId },
          data: { grupoId: grupoBD.id },
        });
        aplicadas++;
      }
      console.log(`  ✅ ${aplicadas} asignaciones aplicadas.`);
    } else if (APPLY && !grupoBD && asignar.length > 0) {
      console.log("");
      console.log(
        `  ⏸  ${asignar.length} asignaciones pendientes — crear primero el Grupo "${cat.grupoNombre}" en BD y re-ejecutar.`
      );
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Resumen total:");
  console.log(
    `   ${totalAsignar} empresas a asignar  (${APPLY ? "aplicadas" : "dry-run"})`
  );
  console.log(`   ${totalSkip} empresas ya en grupo correcto (skip)`);
  console.log(`   ${totalConflicto} conflictos (en otro grupo, NO tocadas)`);

  if (conflictos.length > 0) {
    console.log("\n⚠️  Conflictos a revisar manualmente desde la UI:");
    for (const c of conflictos) {
      console.log(
        `   - ${c.empresa}: actualmente en "${c.grupoActual}", detectado para "${c.grupo}"`
      );
    }
  }

  if (!APPLY && totalAsignar > 0) {
    console.log("\nPara aplicar los cambios: `APPLY=1 npx tsx scripts/assign-grupo-via-persona-cargo.ts`");
  }
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
