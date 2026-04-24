/**
 * backfill-persona-cargo-borme.ts
 *
 * Para empresas sin ningún PersonaCargo vigente desde empresia,
 * rellena con datos de nombramientos del backfill BORME (2 años).
 *
 * Lógica:
 *   1. Identifica empresas con 0 PersonaCargo vigente de fuente='empresia'
 *   2. Obtiene sus BormeAlerta (nombramiento + otros) ordenadas por fecha ASC
 *   3. Extrae personas usando el mismo parser que personas-compartidas
 *   4. "Latest event wins": nombramiento → vigente=true, revocación → vigente=false
 *   5. Upsert en PersonaCargo con fuente='borme' solo para vigente=true
 *      (no sobreescribe registros existentes de fuente='empresia')
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-persona-cargo-borme.ts
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-persona-cargo-borme.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { bormePersonaToCargoKey } from '../src/lib/normalize';
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ── Parser reutilizado de personas-compartidas/route.ts ──────────────────────

const REJECT_WORDS = new Set([
  'A', 'Y', 'O', 'E',
  'SOLIDARIOS', 'SOLIDARIO', 'SOLIDARIAS', 'SOLIDARIA',
  'MANCOMUNADOS', 'MANCOMUNADO', 'MANCOMUNADAS', 'MANCOMUNADA',
  'ADMINISTRADORES', 'ADMINISTRADOR', 'APODERADOS', 'APODERADO',
  'CONSEJEROS', 'CONSEJERO', 'LIQUIDADORES', 'LIQUIDADOR',
  'UNICO', 'UNICOS', 'UNICA', 'UNICAS',
  'UNIPERSONAL', 'UNIPERSONALIDAD',
  'SUSTITUTO', 'SUSTITUTOS', 'DELEGADO', 'DELEGADOS',
  'DATOS', 'REGISTRALES', 'REGISTRAL',
  'TOMO', 'FOLIO', 'HOJA', 'SECCION', 'INSCRIPCION',
  'INISTRACION', 'INISTRADOR', 'CONCURSAL', 'SOCIEDAD', 'CONSTITUCION',
]);

function isLikelyPersonName(name: string): boolean {
  const words = name.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  if (words.some(w => w.length === 1)) return false;
  if (words.some(w => REJECT_WORDS.has(w))) return false;
  if (words.some(w => /\d/.test(w))) return false;
  return true;
}

function normalizeRol(raw: string): string {
  const r = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (/ADM.*SOLID|ADMINISTRADOR.*SOLIDARIO/.test(r)) return 'administrador_solidario';
  if (/ADM.*MANCOM|ADMINISTRADOR.*MANCOMUNADO/.test(r)) return 'administrador_mancomunado';
  if (/ADM.*UNICO|ADMINISTRADOR.*UNICO/.test(r)) return 'administrador_unico';
  if (/ADM|ADMINISTRADOR/.test(r)) return 'administrador';
  if (/APODERADO/.test(r)) return 'apoderado';
  if (/CONSEJERO\s*DELEGADO/.test(r)) return 'consejero_delegado';
  if (/CONSEJERO/.test(r)) return 'consejero';
  if (/LIQUIDADOR/.test(r)) return 'liquidador';
  if (/DIRECTOR/.test(r)) return 'director';
  return 'administrador';
}

function extractPersonasFromDesc(desc: string): Array<{ nombreBorme: string; rol: string; isRevocacion: boolean }> {
  if (!desc) return [];
  const t = desc.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

  const POSITIVE_RE = /\b(NOMBRAMIENTO[S]?)\b/g;
  const NEGATIVE_RE = /\b(REVOCACION[ES]*|CESE[S]?|DIMISION[ES]*|BAJA)\b/g;
  const markers: Array<{ pos: number; positive: boolean }> = [];

  let mx: RegExpExecArray | null;
  while ((mx = POSITIVE_RE.exec(t)) !== null) markers.push({ pos: mx.index, positive: true });
  NEGATIVE_RE.lastIndex = 0;
  while ((mx = NEGATIVE_RE.exec(t)) !== null) markers.push({ pos: mx.index, positive: false });
  markers.sort((a, b) => a.pos - b.pos);

  function getContext(pos: number): boolean | null {
    if (markers.length === 0) return null;
    let last: typeof markers[0] | null = null;
    for (const marker of markers) {
      if (marker.pos < pos) last = marker;
      else break;
    }
    return last === null ? null : last.positive;
  }

  const ROL_RE =
    /\b(ADM\.?\s*(?:SOLID\.?|MANCOM\.?|UNICO\.?|SUSTITUT\.?)?|ADMINISTRADOR(?:\s+(?:SOLIDARIO|MANCOMUNADO|UNICO|SUSTITUTO))?|APODERADO|CONSEJERO(?:\s+DELEGADO)?|LIQUIDADOR|DIRECTOR(?:\s+GENERAL)?|SECRETARIO)\s*:?\s*([A-Z][A-Z ]{4,60}?)(?=\s*[;.,()\d]|$)/g;

  const result: Array<{ nombreBorme: string; rol: string; isRevocacion: boolean }> = [];
  let m: RegExpExecArray | null;
  while ((m = ROL_RE.exec(t)) !== null) {
    const ctx = getContext(m.index);
    const isRevocacion = ctx === false;
    const rolRaw = m[1].trim();
    const namesPart = m[2];
    const names = namesPart.split(';').map(n => n.trim());
    for (const rawName of names) {
      const name = rawName.replace(/[.,;]+$/, '').trim();
      if (!isLikelyPersonName(name)) continue;
      result.push({ nombreBorme: name, rol: normalizeRol(rolRaw), isRevocacion });
    }
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  BACKFILL PersonaCargo desde BORME${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`${'═'.repeat(60)}\n`);

  // 1. Empresas con 0 PersonaCargo vigente de empresia
  const conEmpresiaVigente = await prisma.personaCargo.findMany({
    where: { fuente: 'empresia', vigente: true },
    select: { empresaId: true },
    distinct: ['empresaId'],
  });
  const conEmpresiaIds = new Set(conEmpresiaVigente.map(r => r.empresaId));

  const todasEmpresas = await prisma.empresa.findMany({ select: { id: true } });
  const sinEmpresiaIds = todasEmpresas.map(e => e.id).filter(id => !conEmpresiaIds.has(id));

  console.log(`Empresas totales:                ${todasEmpresas.length}`);
  console.log(`Con PersonaCargo vigente empresia: ${conEmpresiaIds.size}`);
  console.log(`Sin PersonaCargo de empresia:      ${sinEmpresiaIds.length}`);

  // 2. BormeAlerta de esas empresas (nombramiento + otros, que contienen ceses)
  const alertas = await prisma.bormeAlerta.findMany({
    where: {
      empresaId: { in: sinEmpresiaIds },
      tipoActo: { in: ['nombramiento', 'nombramiento_grupo', 'otros'] },
      descripcion: { not: null },
    },
    select: { empresaId: true, descripcion: true, fecha: true, urlBorme: true },
    orderBy: { fecha: 'asc' }, // ASC para "latest wins"
  });

  const empresasConAlertas = new Set(alertas.map(a => a.empresaId)).size;
  console.log(`\nBormeAlertas a procesar:          ${alertas.length}`);
  console.log(`Empresas con alertas BORME:        ${empresasConAlertas}\n`);

  // 3. Acumular "latest event wins" por (empresaId, nombreNorm)
  // Key: `${empresaId}::${nombreNorm}`
  type Entry = {
    empresaId: number;
    nombreNorm: string;  // clave PersonaCargo (sorted tokens)
    nombreOrig: string;  // nombre tal como aparece en BORME
    rol: string;
    fecha: Date;
    urlBorme: string | null;
    vigente: boolean;
  };
  const eventMap = new Map<string, Entry>();

  for (const alerta of alertas) {
    const personas = extractPersonasFromDesc(alerta.descripcion ?? '');
    for (const { nombreBorme, rol, isRevocacion } of personas) {
      const nombreNorm = bormePersonaToCargoKey(nombreBorme);
      if (!nombreNorm || nombreNorm.length < 4) continue;

      const key = `${alerta.empresaId}::${nombreNorm}`;
      const existing = eventMap.get(key);

      if (!existing || alerta.fecha >= existing.fecha) {
        eventMap.set(key, {
          empresaId: alerta.empresaId,
          nombreNorm,
          nombreOrig: nombreBorme,
          rol,
          fecha: alerta.fecha,
          urlBorme: alerta.urlBorme ?? null,
          vigente: !isRevocacion,
        });
      }
    }
  }

  // 4. Solo los vigente=true (nombramiento activo)
  const vigentes = [...eventMap.values()].filter(e => e.vigente);
  const cesados  = [...eventMap.values()].filter(e => !e.vigente);

  console.log(`Personas extraídas (pares empresa+persona): ${eventMap.size}`);
  console.log(`  → Vigentes (nombramiento activo):  ${vigentes.length}`);
  console.log(`  → Cesados (último evento = cese):  ${cesados.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Primeros 20 registros que se insertarían:');
    vigentes.slice(0, 20).forEach(e =>
      console.log(`  empresa ${e.empresaId} | ${e.nombreOrig} | ${e.rol} | ${e.fecha.toISOString().slice(0,10)}`)
    );
    await prisma.$disconnect();
    return;
  }

  // 5. Upsert — no sobreescribir fuente='empresia'
  let inserted = 0, skipped = 0, errors = 0;

  for (const entry of vigentes) {
    try {
      // Comprobar si ya existe un registro de empresia para este par
      const existing = await prisma.personaCargo.findUnique({
        where: { empresaId_nombreNorm: { empresaId: entry.empresaId, nombreNorm: entry.nombreNorm } },
        select: { fuente: true },
      });

      if (existing?.fuente === 'empresia') {
        skipped++;
        continue; // No sobreescribir datos de empresia
      }

      await prisma.personaCargo.upsert({
        where: { empresaId_nombreNorm: { empresaId: entry.empresaId, nombreNorm: entry.nombreNorm } },
        create: {
          empresaId:  entry.empresaId,
          nombreNorm: entry.nombreNorm,
          nombreOrig: entry.nombreOrig,
          rol:        entry.rol,
          fechaDesde: entry.fecha,
          esJuridica: false,
          vigente:    true,
          fuente:     'borme',
        },
        update: {
          nombreOrig: entry.nombreOrig,
          rol:        entry.rol,
          fechaDesde: entry.fecha,
          vigente:    true,
          fuente:     'borme',
          scrapedAt:  new Date(),
        },
      });
      inserted++;
    } catch {
      errors++;
    }
  }

  console.log(`\n✅ Backfill completado:`);
  console.log(`   Insertados/actualizados: ${inserted}`);
  console.log(`   Omitidos (ya tenían empresia): ${skipped}`);
  console.log(`   Errores:  ${errors}`);

  const total = await prisma.personaCargo.count();
  const totalVigentes = await prisma.personaCargo.count({ where: { vigente: true } });
  const fromBorme = await prisma.personaCargo.count({ where: { fuente: 'borme' } });
  const empresasConCargo = await prisma.personaCargo.groupBy({ by: ['empresaId'], where: { vigente: true }, _count: true });

  console.log(`\n📊 Estado final PersonaCargo:`);
  console.log(`   Total registros:      ${total}`);
  console.log(`   Vigentes:             ${totalVigentes}`);
  console.log(`   Fuente=borme:         ${fromBorme}`);
  console.log(`   Empresas con cargo vigente: ${empresasConCargo.length} (de ${todasEmpresas.length})`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
