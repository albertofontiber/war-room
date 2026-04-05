import { PrismaClient } from '@prisma/client';
require('dotenv').config({ path: '.env.local' });
const p = new PrismaClient();

const CP_PROVINCIA: Record<string, string> = {
  '01':'Álava','02':'Albacete','03':'Alicante','04':'Almería',
  '05':'Ávila','06':'Badajoz','07':'Baleares','08':'Barcelona',
  '09':'Burgos','10':'Cáceres','11':'Cádiz','12':'Castellón',
  '13':'Ciudad Real','14':'Córdoba','15':'A Coruña','16':'Cuenca',
  '17':'Gerona','18':'Granada','19':'Guadalajara','20':'Guipúzcoa',
  '21':'Huelva','22':'Huesca','23':'Jaén','24':'León',
  '25':'Lérida','26':'La Rioja','27':'Lugo','28':'Madrid',
  '29':'Málaga','30':'Murcia','31':'Navarra','32':'Orense',
  '33':'Asturias','34':'Palencia','35':'Las Palmas','36':'Pontevedra',
  '37':'Salamanca','38':'Santa Cruz de Tenerife','39':'Cantabria',
  '40':'Segovia','41':'Sevilla','42':'Soria','43':'Tarragona',
  '44':'Teruel','45':'Toledo','46':'Valencia','47':'Valladolid',
  '48':'Vizcaya','49':'Zamora','50':'Zaragoza','51':'Ceuta','52':'Melilla',
};

// Variantes conocidas → nombre castellano canónico
const ALIAS: Record<string, string> = {
  'bizkaia': 'Vizcaya', 'biskaia': 'Vizcaya',
  'gipuzkoa': 'Guipúzcoa', 'guipuzcoa': 'Guipúzcoa',
  'araba': 'Álava', 'araba/alava': 'Álava',
  'girona': 'Gerona',
  'lleida': 'Lérida', 'lerida': 'Lérida',
  'ourense': 'Orense',
  'illes balears': 'Baleares', 'islas baleares': 'Baleares',
  'a coruña': 'A Coruña', 'la coruña': 'A Coruña', 'coruña': 'A Coruña',
};

function norm(s: string | null): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, '').trim();
}

function resolveAlias(prov: string | null): string | null {
  if (!prov) return null;
  const k = norm(prov);
  for (const [alias, canon] of Object.entries(ALIAS)) {
    if (k === norm(alias)) return canon;
  }
  return prov;
}

function isMatch(cpProv: string, bdProv: string): boolean {
  const a = norm(cpProv), b = norm(bdProv);
  return a === b || a.includes(b) || b.includes(a);
}

async function main() {
  const rows = await p.empresa.findMany({
    where: { codigoPostal: { not: null }, provincia: { not: null } },
    select: { cif: true, nombre: true, codigoPostal: true, provincia: true }
  });

  const variantCount: Record<string, number> = {};
  const genuineMap: Record<string, Array<{nombre: string, cp: string}>> = {};

  for (const e of rows) {
    const prefix = (e.codigoPostal ?? '').slice(0, 2);
    const cpProv = CP_PROVINCIA[prefix];
    if (!cpProv) continue;

    // Ya coincide directamente
    if (isMatch(cpProv, e.provincia!)) continue;

    // ¿Coincide después de resolver alias?
    const resolved = resolveAlias(e.provincia);
    if (resolved && isMatch(cpProv, resolved)) {
      const key = `${e.provincia} → ${resolved}`;
      variantCount[key] = (variantCount[key] || 0) + 1;
      continue;
    }

    // Error genuino
    const key = `${cpProv} vs ${e.provincia}`;
    if (!genuineMap[key]) genuineMap[key] = [];
    genuineMap[key].push({ nombre: e.nombre.slice(0, 45), cp: e.codigoPostal! });
  }

  console.log('=== VARIANTES DE NOMBRE (resolubles con alias) ===');
  for (const [k, v] of Object.entries(variantCount).sort((a, b) => b[1] - a[1]))
    console.log(`  ${v} casos: ${k}`);
  const totalVariants = Object.values(variantCount).reduce((a, b) => a + b, 0);
  console.log(`Total: ${totalVariants}\n`);

  console.log('=== ERRORES GENUINOS (provincia BD no coincide con CP) ===');
  const sorted = Object.entries(genuineMap).sort((a, b) => b[1].length - a[1].length);
  for (const [k, arr] of sorted) {
    console.log(`  ${arr.length} casos: ${k}`);
    arr.slice(0, 3).forEach(r => console.log(`    - ${r.nombre} (CP ${r.cp})`));
  }
  const totalGenuine = Object.values(genuineMap).reduce((a, b) => a + b.length, 0);
  console.log(`\nTotal errores genuinos: ${totalGenuine}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e.message); p.$disconnect(); });
