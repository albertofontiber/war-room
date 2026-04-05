import { PrismaClient } from '@prisma/client';
require('dotenv').config({ path: '.env.local' });
const p = new PrismaClient();

async function main() {
  const rows = await p.bormeAlerta.findMany({
    where: { tipoActo: { in: ['nombramiento', 'nombramiento_grupo'] }, descripcion: { not: null } },
    select: { descripcion: true, personaDetectada: true, fecha: true },
    take: 20,
    orderBy: { fecha: 'desc' },
  });
  rows.forEach((r, i) => {
    console.log(`--- ${i} (${r.fecha.toISOString().slice(0,10)}) ---`);
    console.log(r.descripcion?.slice(0, 400));
    console.log();
  });
  await p.$disconnect();
}
main().catch(e => { console.error(e.message); p.$disconnect(); });
