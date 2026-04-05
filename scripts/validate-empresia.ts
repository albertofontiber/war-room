/**
 * validate-empresia.ts
 * Validación en 4 dimensiones del scraping de empresia.es
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/validate-empresia.ts
 */

import { PrismaClient } from '@prisma/client';
import { normalizePersona } from '../src/lib/normalize';

require('dotenv').config({ path: '.env.local' });
const prisma = new PrismaClient();

// ── Mapa CP (primeros 2 dígitos) → provincia ────────────────────────────────
const CP_PROVINCIA: Record<string, string> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería',
  '05': 'Ávila', '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona',
  '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
  '17': 'Gerona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid',
  '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
  '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria',
  '40': 'Segovia', '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona',
  '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid',
  '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

// Normalizar provincia para comparación flexible
function normProv(p: string | null): string {
  if (!p) return '';
  return p.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '').trim();
}

// Personas clave de GRUPOS_SENALES (extraídas de borme-senales.ts)
const PERSONAS_CONOCIDAS = [
  { nombre: 'LUCIANO VILLEN MARTA',           grupo: 'Grupo Fire',    empresasCif: ['B67795088'] },
  { nombre: 'ZALA NAVARRO ALEJANDRO',         grupo: 'Grupo Fire',    empresasCif: ['B67795088'] },
  { nombre: 'REYES ROMERO LUIS ROBERTO',      grupo: 'Grupo Fire',    empresasCif: ['B67795088'] },
  { nombre: 'GUITARD MALDONADO ALVARO',       grupo: 'Grupo Fire',    empresasCif: ['B67795088'] },
  { nombre: 'BJURSTROM TOR FILIP',            grupo: 'Eurofesa',      empresasCif: ['A78306955'] },
  { nombre: 'FRANSSON BENGT OLOF JOHAN',      grupo: 'Eurofesa',      empresasCif: ['A78306955'] },
  { nombre: 'LOPEZ LOPEZ DAVID',              grupo: 'Eurofesa',      empresasCif: ['A78306955'] },
];

async function main() {
  const totalCargos = await prisma.personaCargo.count();
  const totalEmpresas = await prisma.empresa.count();
  const empresasConCargo = await prisma.personaCargo.groupBy({ by: ['empresaId'], _count: true });

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  VALIDACIÓN SCRAPING EMPRESIA.ES');
  console.log('════════════════════════════════════════════════════════\n');
  console.log(`📊 Total PersonaCargo: ${totalCargos} registros en ${empresasConCargo.length} empresas (de ${totalEmpresas} en BD)`);
  console.log(`   Cobertura: ${((empresasConCargo.length / totalEmpresas) * 100).toFixed(1)}% empresas con al menos 1 cargo\n`);

  // ── 1. VALIDACIÓN DIRECCIÓN/CP/PROVINCIA ──────────────────────────────────
  console.log('── 1. DIRECCIÓN / CÓDIGO POSTAL / PROVINCIA ─────────────\n');

  const conDireccion = await prisma.empresa.count({ where: { direccion: { not: null } } });
  const conCP = await prisma.empresa.count({ where: { codigoPostal: { not: null } } });
  const conLocalidad = await prisma.empresa.count({ where: { localidad: { not: null } } });
  const conAnio = await prisma.empresa.count({ where: { anioConstitucion: { not: null } } });

  console.log(`   Empresas con dirección:          ${conDireccion} (${((conDireccion/totalEmpresas)*100).toFixed(1)}%)`);
  console.log(`   Empresas con código postal:      ${conCP} (${((conCP/totalEmpresas)*100).toFixed(1)}%)`);
  console.log(`   Empresas con localidad:          ${conLocalidad} (${((conLocalidad/totalEmpresas)*100).toFixed(1)}%)`);
  console.log(`   Empresas con año constitución:   ${conAnio} (${((conAnio/totalEmpresas)*100).toFixed(1)}%)`);

  // Verificar coherencia CP → provincia
  const conCPyProvincia = await prisma.empresa.findMany({
    where: { codigoPostal: { not: null }, provincia: { not: null } },
    select: { cif: true, nombre: true, codigoPostal: true, provincia: true },
  });

  let cpOk = 0, cpMismatch = 0;
  const mismatchSamples: string[] = [];
  for (const e of conCPyProvincia) {
    const prefix = (e.codigoPostal ?? '').slice(0, 2);
    const provCP = CP_PROVINCIA[prefix];
    if (!provCP) continue;
    const match = normProv(provCP).includes(normProv(e.provincia)) ||
                  normProv(e.provincia).includes(normProv(provCP));
    if (match) cpOk++;
    else {
      cpMismatch++;
      if (mismatchSamples.length < 5)
        mismatchSamples.push(`  ${e.nombre} — CP ${e.codigoPostal} (→${provCP}) vs BD: ${e.provincia}`);
    }
  }
  console.log(`\n   CP coherente con provincia BD:  ${cpOk}/${conCPyProvincia.length} (${((cpOk/Math.max(conCPyProvincia.length,1))*100).toFixed(1)}%)`);
  if (cpMismatch > 0) {
    console.log(`   ⚠️  Mismatches (${cpMismatch}):`);
    mismatchSamples.forEach(s => console.log(s));
  }

  // ── 2. CARGOS VS BORME ────────────────────────────────────────────────────
  console.log('\n── 2. CARGOS EMPRESIA vs BORME (últimos 2 años) ─────────\n');

  // Personas detectadas en BORME con nombramiento activo
  const bormePersonas = await prisma.bormeAlerta.findMany({
    where: {
      tipoActo: { in: ['nombramiento', 'nombramiento_grupo', 'posible_adquisicion'] },
      personaDetectada: { not: null },
    },
    select: { empresaId: true, personaDetectada: true },
  });

  const bormeMap = new Map<string, Set<string>>(); // empresaId → Set<nombreNorm>
  for (const b of bormePersonas) {
    if (!b.personaDetectada) continue;
    const norm = normalizePersona(b.personaDetectada);
    if (!bormeMap.has(String(b.empresaId))) bormeMap.set(String(b.empresaId), new Set());
    bormeMap.get(String(b.empresaId))!.add(norm);
  }

  // Personas en PersonaCargo (vigentes)
  const cargos = await prisma.personaCargo.findMany({
    where: { vigente: true },
    select: { empresaId: true, nombreNorm: true, nombreOrig: true },
  });

  const cargoMap = new Map<string, Set<string>>(); // empresaId → Set<nombreNorm>
  for (const c of cargos) {
    if (!cargoMap.has(String(c.empresaId))) cargoMap.set(String(c.empresaId), new Set());
    cargoMap.get(String(c.empresaId))!.add(c.nombreNorm);
  }

  // Comparar: personas BORME que también están en PersonaCargo (mismo empresa)
  let bormeEnEmpresiaCount = 0, bormeNoEnEmpresiaCount = 0;
  const bormeNoEnEmpresiaExamples: string[] = [];

  for (const [empresaId, nombres] of bormeMap) {
    const empresiaNombres = cargoMap.get(empresaId) ?? new Set();
    for (const nombre of nombres) {
      if (empresiaNombres.has(nombre)) bormeEnEmpresiaCount++;
      else {
        bormeNoEnEmpresiaCount++;
        if (bormeNoEnEmpresiaExamples.length < 8) {
          const emp = await prisma.empresa.findUnique({ where: { id: parseInt(empresaId) }, select: { nombre: true } });
          bormeNoEnEmpresiaExamples.push(`  ${nombre} → ${emp?.nombre ?? empresaId}`);
        }
      }
    }
  }

  const total = bormeEnEmpresiaCount + bormeNoEnEmpresiaCount;
  console.log(`   Personas BORME encontradas tb en PersonaCargo: ${bormeEnEmpresiaCount}/${total} (${((bormeEnEmpresiaCount/Math.max(total,1))*100).toFixed(1)}%)`);
  console.log(`   Personas BORME NO en PersonaCargo (cesadas o normalizacion diff): ${bormeNoEnEmpresiaCount}`);
  if (bormeNoEnEmpresiaExamples.length > 0) {
    console.log('   Ejemplos:');
    bormeNoEnEmpresiaExamples.forEach(e => console.log(e));
  }

  // ── 3. PERSONAS CONOCIDAS (GRUPOS_SENALES) ────────────────────────────────
  console.log('\n── 3. PERSONAS CLAVE DE GRUPOS CONOCIDOS ────────────────\n');

  for (const persona of PERSONAS_CONOCIDAS) {
    const normBorme = normalizePersona(persona.nombre);
    const empresas = await prisma.empresa.findMany({
      where: { cif: { in: persona.empresasCif } },
      select: { id: true, nombre: true },
    });
    for (const emp of empresas) {
      const cargo = await prisma.personaCargo.findUnique({
        where: { empresaId_nombreNorm: { empresaId: emp.id, nombreNorm: normBorme } },
      });
      const status = cargo ? (cargo.vigente ? '✅ VIGENTE' : '⚠️  cesado') : '❌ NO ENCONTRADO';
      console.log(`   ${status} | ${persona.nombre} → ${emp.nombre}`);
      if (!cargo) {
        // Buscar con fuzzy para diagnóstico
        const similar = await prisma.personaCargo.findMany({
          where: { empresaId: emp.id, nombreNorm: { contains: normBorme.split(' ')[0] } },
          select: { nombreNorm: true, nombreOrig: true },
        });
        if (similar.length > 0) console.log(`     Similares en DB: ${similar.map(s => s.nombreOrig).join(', ')}`);
      }
    }
  }

  // ── 4. PERSONAS EN MÚLTIPLES EMPRESAS ────────────────────────────────────
  console.log('\n── 4. PERSONAS EN MÚLTIPLES EMPRESAS (vigentes) ─────────\n');

  const personasMultiples = await prisma.$queryRaw<{ nombreNorm: string; nombreOrig: string; count: bigint }[]>`
    SELECT "nombreNorm", MIN("nombreOrig") as "nombreOrig", COUNT(DISTINCT "empresaId") as count
    FROM "PersonaCargo"
    WHERE vigente = true
    GROUP BY "nombreNorm"
    HAVING COUNT(DISTINCT "empresaId") >= 2
    ORDER BY count DESC
    LIMIT 20
  `;

  console.log(`   Personas con cargo vigente en ≥2 empresas: ${personasMultiples.length} (top 20)`);
  console.log();
  for (const p of personasMultiples) {
    // Obtener nombres de las empresas
    const empresasDePersona = await prisma.personaCargo.findMany({
      where: { nombreNorm: p.nombreNorm, vigente: true },
      include: { empresa: { select: { nombre: true, enPerimetro: true } } },
    });
    const enPerimetro = empresasDePersona.filter(e => e.empresa.enPerimetro).length;
    const nombres = empresasDePersona.map(e => e.empresa.nombre.slice(0, 30)).join(' | ');
    console.log(`   [${p.count} emp, ${enPerimetro} en perímetro] ${p.nombreOrig}`);
    console.log(`   → ${nombres}`);
  }

  // Comparar con personas-compartidas actual (BORME)
  const personasBorme = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "personaDetectada") as count
    FROM "BormeAlerta"
    WHERE "personaDetectada" IS NOT NULL
    GROUP BY "personaDetectada"
    HAVING COUNT(DISTINCT "empresaId") >= 2
  `;
  console.log(`\n   Personas en ≥2 empresas vía BORME (actual): ${personasBorme.length}`);
  console.log(`   Personas en ≥2 empresas vía PersonaCargo:   ${personasMultiples.length}`);
  console.log(`   → Incremento: +${personasMultiples.length - personasBorme.length} personas detectadas gracias a empresia`);

  console.log('\n════════════════════════════════════════════════════════\n');
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
