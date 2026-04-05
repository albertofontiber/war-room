import { PrismaClient } from '@prisma/client';
require('dotenv').config({ path: '.env.local' });
const p = new PrismaClient();

// Muestra detalles de errores genuinos seleccionados
const GENUINE_EXAMPLES = [
  'ELECNOR, S.A.',
  'COVERT SECURITY, S.L.',
  'SANSEGUR SEGURIDAD, S.L.U.',
  'ITURRI  S.A.',
  'GRAU 3 SEGURETAT 2011, S.L',
  'COLTAN ELECTRONICS, S.L.',
];

// Correcciones de alias: provincia actual → canónica
const ALIAS_FIXES: Array<{ from: string; to: string }> = [
  { from: 'Illes Balears', to: 'Baleares' },
  { from: 'Lleida',        to: 'Lérida'   },
  { from: 'Ourense',       to: 'Orense'   },
];

async function main() {
  // 1. Ejemplos de errores genuinos
  console.log('=== EJEMPLOS ERRORES GENUINOS ===\n');
  const ejemplos = await p.empresa.findMany({
    where: { nombre: { in: GENUINE_EXAMPLES } },
    select: { nombre: true, codigoPostal: true, provincia: true, localidad: true, enPerimetro: true, fuente: true },
  });
  for (const e of ejemplos) {
    console.log(`  ${e.nombre}`);
    console.log(`    CP: ${e.codigoPostal} | Provincia BD: ${e.provincia} | Localidad: ${e.localidad}`);
    console.log(`    enPerimetro: ${e.enPerimetro} | Fuente: ${e.fuente}`);
    console.log();
  }

  // 2. Corregir alias
  console.log('=== CORRIGIENDO ALIASES ===\n');
  let total = 0;
  for (const fix of ALIAS_FIXES) {
    const r = await p.empresa.updateMany({
      where: { provincia: fix.from },
      data:  { provincia: fix.to  },
    });
    console.log(`  "${fix.from}" → "${fix.to}": ${r.count} empresas actualizadas`);
    total += r.count;
  }
  console.log(`\nTotal corregidas: ${total}`);
  await p.$disconnect();
}
main().catch(e => { console.error(e.message); p.$disconnect(); });
