import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DUMMY_CIFS = [
  "B48123456", "B48234567", "A20345678", "A28456789", "B28567890",
  "A28678901", "A08789012", "B08890123", "A41901234", "B29012345",
  "B09123456", "B47234567", "B50345678", "B33456789", "B15567890",
];

async function main() {
  // Buscar los ids de las empresas dummy
  const empresas = await prisma.empresa.findMany({
    where: { cif: { in: DUMMY_CIFS } },
    select: { id: true, nombre: true },
  });

  if (empresas.length === 0) {
    console.log("ℹ️   No se encontraron empresas dummy — ya estaban eliminadas.");
    return;
  }

  const ids = empresas.map((e) => e.id);
  console.log(`🔍  Encontradas ${ids.length} empresas dummy:`, empresas.map((e) => e.nombre).join(", "));

  // Borrar dependientes primero (sin cascade en el schema)
  const delFin   = await prisma.financiero.deleteMany({ where: { empresaId: { in: ids } } });
  const delCrm   = await prisma.crmEstado.deleteMany({ where: { empresaId: { in: ids } } });
  const delBorme = await prisma.bormeAlerta.deleteMany({ where: { empresaId: { in: ids } } });
  const delAct   = await prisma.actividad.deleteMany({ where: { empresaId: { in: ids } } });
  console.log(`   Financieros: ${delFin.count} | CRM: ${delCrm.count} | BORME: ${delBorme.count} | Actividades: ${delAct.count}`);

  const del = await prisma.empresa.deleteMany({
    where: { cif: { in: DUMMY_CIFS } },
  });
  console.log(`✅  Empresas dummy eliminadas: ${del.count}`);

  // Grupos del seed (ids 1–4) — solo si ya no tienen empresas reales
  const grupos = await prisma.grupo.findMany({
    where: { id: { in: [1, 2, 3, 4] } },
    include: { _count: { select: { empresas: true } } },
  });

  for (const g of grupos) {
    if (g._count.empresas === 0) {
      await prisma.grupo.delete({ where: { id: g.id } });
      console.log(`🗑️   Grupo eliminado: ${g.nombre}`);
    } else {
      console.log(`⚠️   Grupo conservado (tiene empresas reales): ${g.nombre} → ${g._count.empresas} empresas`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
