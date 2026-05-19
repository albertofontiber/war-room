/**
 * import-contactos-extra.ts
 *
 * Mini-script ad-hoc para añadir contactos M&A cuyas empresas NO matchean
 * automáticamente desde el Excel "Contactos Empresas PCI" (porque el nombre
 * de empresa en BD es totalmente distinto). Aquí los hardcodeamos por
 * `empresaId` (resolved via CIF previamente).
 *
 * Ejecutar después de `import-contactos-excel.ts`.
 *
 * Reglas:
 *   - Match por `empresaId` directo (no por nombre).
 *   - Skip si el contacto ya existe (mismo nombre o email en esa empresa).
 *   - Modos: dry-run (default) o `APPLY=1`.
 */

import { prisma } from "../src/lib/prisma";

const APPLY = process.env.APPLY === "1";

interface ContactoExtra {
  empresaId: number;
  empresaNombre: string; // solo para log
  cif: string; // solo para log
  nombre: string;
  cargo: string | null;
  email: string | null;
  notas: string | null;
}

const CONTACTOS: ContactoExtra[] = [
  // EXTI NORTE, S.L. (CIF B20646717 = Excel "EXTINORTE")
  // Empresa SÍ detectable por matcher (nombre_colapsado), incluida aquí por
  // unificar todo el batch en un único script en vez de duplicar lógica.
  {
    empresaId: 1696,
    empresaNombre: "EXTI NORTE, S.L.",
    cif: "B20646717",
    nombre: "Javier Monsalvo",
    cargo: null,
    email: "javier@extinorte.com",
    notas: "Excel referencia: 3. Extinorte",
  },
  {
    empresaId: 1696,
    empresaNombre: "EXTI NORTE, S.L.",
    cif: "B20646717",
    nombre: "Erik Extinorte",
    cargo: null,
    email: "erik@extinorte.com",
    notas: "Excel referencia: 3. Extinorte",
  },
  {
    empresaId: 1696,
    empresaNombre: "EXTI NORTE, S.L.",
    cif: "B20646717",
    nombre: "Su Extinorte",
    cargo: null,
    email: "su@extinorte.com",
    notas: "Excel referencia: 3. Extinorte",
  },
  // 3F INGENIERIA MANTENIMIENTOS, S.L. (CIF B81296949 = Excel "3F PROTECCION CONTRA INCENDIOS")
  // Empresa NO detectable por matcher (nombre BD totalmente distinto).
  {
    empresaId: 1077,
    empresaNombre: "3F INGENIERIA MANTENIMIENTOS, S.L.",
    cif: "B81296949",
    nombre: "Alberto Martin Guijarro",
    cargo: null,
    email: "alberto@3fingenieria.com",
    notas: "Excel referencia: 3F PROTECCION CONTRA INCENDIOS",
  },
  {
    empresaId: 1077,
    empresaNombre: "3F INGENIERIA MANTENIMIENTOS, S.L.",
    cif: "B81296949",
    nombre: "Felipe Martín",
    cargo: null,
    email: "felipe@3fingenieria.com",
    notas: "Excel referencia: 3F PROTECCION CONTRA INCENDIOS",
  },
  // INGENIERIA Y CONSERVACION CONTRAINCENDIOS, S.L. (CIF B84194034 = Excel "ICC")
  // Empresa NO detectable por matcher (ICC = iniciales del nombre completo).
  {
    empresaId: 1750,
    empresaNombre: "INGENIERIA Y CONSERVACION CONTRAINCENDIOS, S.L.",
    cif: "B84194034",
    nombre: "David de las Vecillas",
    cargo: null,
    email: "dvecillas@iccmadrid.com",
    notas: "Excel referencia: ICC",
  },
  // SIEF 2 SL (CIF B25233487 = Excel "SIEF2")
  // Empresa SÍ detectable por matcher (nombre_colapsado: "SIEF 2" ≡ "SIEF2").
  // Contacto real proporcionado fuera del Excel (que solo tenía un placeholder).
  {
    empresaId: 946,
    empresaNombre: "SIEF 2 SL",
    cif: "B25233487",
    nombre: "Alejandro Teres",
    cargo: null,
    email: "alejandro.teres@sief2.com",
    notas: "Excel referencia: 13. Sief2",
  },
];

async function main() {
  console.log(
    APPLY
      ? "🛠️  Modo APLICAR — los contactos se crearán en BD."
      : "🔍 Modo dry-run — usa APPLY=1 para aplicar."
  );
  console.log("");

  let crear = 0;
  let skipExiste = 0;
  let skipNoEmpresa = 0;

  for (const c of CONTACTOS) {
    // Verificar que la empresa existe
    const empresa = await prisma.empresa.findUnique({
      where: { id: c.empresaId },
      select: { id: true, nombre: true, cif: true },
    });
    if (!empresa) {
      console.log(
        `❌ Empresa [${c.empresaId}] no existe — saltando: ${c.nombre}`
      );
      skipNoEmpresa++;
      continue;
    }
    if (empresa.cif !== c.cif) {
      console.log(
        `⚠️  CIF mismatch [${c.empresaId}]: esperado ${c.cif}, en BD ${empresa.cif} — saltando: ${c.nombre}`
      );
      skipNoEmpresa++;
      continue;
    }

    // Verificar si el contacto ya existe (nombre o email exact case-insensitive
    // dentro de la misma empresa)
    const orClauses: Array<Record<string, unknown>> = [
      { nombre: { equals: c.nombre, mode: "insensitive" } },
    ];
    if (c.email) {
      orClauses.push({
        email: { equals: c.email, mode: "insensitive" },
      });
    }
    const existing = await prisma.contacto.findFirst({
      where: { empresaId: c.empresaId, OR: orClauses },
      select: { id: true, nombre: true, email: true },
    });

    if (existing) {
      console.log(
        `⏭  Ya existe (Contacto.id=${existing.id}: "${existing.nombre}" / ${existing.email ?? "—"}): ${c.nombre} en [${empresa.id}] ${empresa.nombre}`
      );
      skipExiste++;
      continue;
    }

    console.log(
      `➕ ${c.nombre} | ${c.email ?? "—"} | empresa [${empresa.id}] ${empresa.nombre} (${c.cif})`
    );
    crear++;

    if (APPLY) {
      await prisma.contacto.create({
        data: {
          empresaId: c.empresaId,
          nombre: c.nombre,
          cargo: c.cargo,
          email: c.email,
          telefono: null,
          notas: c.notas,
        },
      });
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Resumen:");
  console.log(`   ${crear} a crear ${APPLY ? "(aplicados)" : "(dry-run)"}`);
  console.log(`   ${skipExiste} ya existían`);
  console.log(`   ${skipNoEmpresa} con problema de empresa`);

  if (!APPLY && crear > 0) {
    console.log(
      "\nPara aplicar: `APPLY=1 npx tsx scripts/import-contactos-extra.ts`"
    );
  }
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
