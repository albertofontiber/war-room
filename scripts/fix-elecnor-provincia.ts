import { PrismaClient } from '@prisma/client';
require('dotenv').config({ path: '.env.local' });
const p = new PrismaClient();

async function main() {
  const r = await p.empresa.updateMany({
    where: { nombre: 'ELECNOR, S.A.' },
    data: { provincia: 'Madrid' },
  });
  console.log('ELECNOR, S.A. → provincia: Madrid |', r.count, 'registro(s) actualizados');

  // Verificar
  const check = await p.empresa.findFirst({
    where: { nombre: 'ELECNOR, S.A.' },
    select: { nombre: true, provincia: true, localidad: true, codigoPostal: true },
  });
  console.log('Verificación:', check);
  await p.$disconnect();
}
main().catch(e => { console.error(e.message); p.$disconnect(); });
