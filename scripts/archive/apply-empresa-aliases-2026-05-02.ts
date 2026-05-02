/**
 * One-off para aplicar `nombreComercial` (alias) a un mapping de empresas
 * por id. Aliases acordados con Alberto el 2026-05-02 durante la sesión
 * Fase 1 del cut-over OneDrive + Notion.
 *
 * Read-only por defecto. Para aplicar: APPLY=1.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mapping id de empresa → alias comercial. IDs sacados del último dry-run.
const ALIASES: Array<{ id: number; nombre: string; alias: string }> = [
  { id: 1778, nombre: "EXTINTORES PAMPLONA SL", alias: "Fireprotect" },
  { id: 1986, nombre: "GRUPO PROINTEX SERVICIOS CONTRAINCENDIOS, S.L.L.", alias: "Prointex" },
  { id: 2458, nombre: "I.C.E. SEGORBE, S.L.", alias: "Segorbe" },
  { id: 1750, nombre: "INGENIERIA Y CONSERVACION CONTRAINCENDIOS, S.L.", alias: "ICC" },
  // SISTEMAS DE PROTECCION ORSEI
  { id: 0, nombre: "SISTEMAS DE PROTECCION ORSEI SL", alias: "Orsei" },
  // TRATEIN PCI INSTALACIONES
  { id: 0, nombre: "TRATEIN PCI INSTALACIONES, SL", alias: "Tratein" },
  // PROTECCION Y DETECCION DE INCENDIOS
  { id: 0, nombre: "PROTECCION Y DETECCION DE INCENDIOS SL", alias: "Prodein" },
  // PROTECCION Y SEGURIDAD NORTE
  { id: 0, nombre: "PROTECCION Y SEGURIDAD NORTE, S.L.", alias: "Prosenor" },
  // ELDUR SEGURIDAD
  { id: 2234, nombre: "ELDUR SEGURIDAD S.L.", alias: "Eldur" },
  // PREVIFOC
  { id: 0, nombre: "PREVIFOC, SL", alias: "Previnfoc (grupRead)" },
  // COSMOS
  { id: 1591, nombre: "COSMOS PROTECCION CONTRA INCENDIOS, SL", alias: "Cosmos PCI" },
  // ELECTRO ALAVESA
  { id: 1102, nombre: "ELECTRO ALAVESA, S.A.", alias: "Electro Alavesa (by Attlon)" },
  // PCI KOSMOS GROUP
  { id: 0, nombre: "PCI KOSMOS GROUP SA", alias: "Kosmos Group (by Scutum)" },
  // SEGURINCAT
  { id: 0, nombre: "SEGURINCAT SEGURETAT I VIGILANCIA SL", alias: "Segurincat" },
  // SEGURITEC COSTA BRAVA
  { id: 0, nombre: "SEGURITEC COSTA BRAVA 2004, SL", alias: "Project Lula" },
  // SEYMAN
  { id: 0, nombre: "SEYMAN SERVICIOS Y EQUIPOS DE PROTECCION CONTRA INCENDIOS SLL", alias: "Seyman" },
  // Tecnics
  { id: 0, nombre: "Tecnics en seguretat i foc  S.L.", alias: "Tecnics en Securitat i Foc" },
];

async function main() {
  const apply = process.env.APPLY === "1";
  console.log(apply ? "APPLY mode\n" : "DRY-RUN mode (no escribe)\n");

  // Resolvemos id por nombre exacto (más fiable que ids hardcodeados que
  // pueden haber cambiado).
  let updated = 0;
  for (const row of ALIASES) {
    const empresa = await prisma.empresa.findFirst({
      where: { nombre: row.nombre },
      select: { id: true, nombre: true, nombreComercial: true },
    });
    if (!empresa) {
      console.warn(`⚠️  No encontrada: "${row.nombre}"`);
      continue;
    }
    const before = empresa.nombreComercial;
    if (before === row.alias) {
      console.log(`= ${empresa.nombre.padEnd(60)} alias ya = "${row.alias}"`);
      continue;
    }
    console.log(`→ ${empresa.nombre.padEnd(60)} alias: "${before ?? "(null)"}" → "${row.alias}"`);
    if (apply) {
      await prisma.empresa.update({
        where: { id: empresa.id },
        data: { nombreComercial: row.alias },
      });
      updated++;
    }
  }
  console.log(apply ? `\n✅ ${updated} empresas actualizadas.` : "\nDry-run completo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
