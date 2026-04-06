import { PrismaClient } from '@prisma/client';
import { bormePersonaToCargoKey } from '../src/lib/normalize';
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

const FIRE_PERSONAS_BORME = [
  'LUCIANO VILLEN MARTA',
  'ZALA NAVARRO ALEJANDRO',
  'REYES ROMERO LUIS ROBERTO',
  'GUITARD MALDONADO ALVARO',
  'DE LA PASCUA ARAGON PABLO',
];

async function main() {
  const fireGroup = await prisma.grupo.findFirst({
    where: { nombre: { contains: 'Fire' } },
    select: { id: true, nombre: true },
  });
  if (!fireGroup) { console.log('Grupo Fire no encontrado'); return; }
  console.log(`Grupo: ${fireGroup.nombre} (id=${fireGroup.id})\n`);

  const keys = FIRE_PERSONAS_BORME.map(p => ({ borme: p, key: bormePersonaToCargoKey(p) }));
  console.log('Claves PersonaCargo:');
  keys.forEach(k => console.log(`  ${k.borme}  →  ${k.key}`));
  console.log();

  const nombreNorms = keys.map(k => k.key).filter(Boolean) as string[];

  const cargos = await prisma.personaCargo.findMany({
    where: { nombreNorm: { in: nombreNorms }, vigente: true },
    select: {
      nombreNorm: true,
      nombreOrig: true,
      rol: true,
      fuente: true,
      empresa: { select: { id: true, nombre: true, grupoId: true } },
    },
  });

  const sinGrupoFire = cargos.filter(c => c.empresa.grupoId !== fireGroup.id);
  const conGrupoFire = cargos.filter(c => c.empresa.grupoId === fireGroup.id);

  console.log(`Total apariciones PersonaCargo vigentes: ${cargos.length}`);
  console.log(`  → Ya en Grupo Fire:          ${conGrupoFire.length}`);
  console.log(`  → En otras empresas:          ${sinGrupoFire.length}\n`);

  if (sinGrupoFire.length > 0) {
    console.log('Empresas SIN Grupo Fire donde aparecen personas de Fire:');
    sinGrupoFire.forEach(c =>
      console.log(`  ${c.nombreNorm}\n    Empresa: ${c.empresa.nombre} (id=${c.empresa.id}, grupoId=${c.empresa.grupoId ?? 'null'}) | rol: ${c.rol} | fuente: ${c.fuente}`)
    );
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); prisma.$disconnect(); });
