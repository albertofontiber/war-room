/**
 * scrape-empresite-direcciones.ts
 * Scraping puntual de empresite.eleconomista.es para obtener direcciones
 * de empresas que no tienen datos de ubicación en la BD.
 *
 * Extrae del JSON-LD: streetAddress, postalCode, addressLocality, addressRegion
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/scrape-empresite-direcciones.ts
 */

import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();
const DELAY_MS = 3000; // empresite tiene rate limit agresivo

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function nombreToSlug(nombre: string): string {
  return nombre
    .replace(/,\s*/g, ' ')
    .replace(/[.'()]/g, '')
    .replace(/\s+/g, '-')
    .toUpperCase();
}

interface EmpresiteData {
  streetAddress: string | null;
  postalCode: string | null;
  locality: string | null;
  region: string | null;
  telefono: string | null;
  web: string | null;
  email: string | null;
  empleados: number | null;
}

async function scrapeEmpresiteByCif(cif: string, nombre: string): Promise<EmpresiteData | null> {
  // Intentar varias variantes del slug
  const nombreSinForma = nombre
    .replace(/,?\s*(S\.?L\.?U?\.?|S\.?A\.?|S\.?C\.?P\.?|S\.?L\.?L\.?|C\.?B\.?|SOCIEDAD LIMITADA|SL|SA|SLU|SCP|CB)\s*$/i, '')
    .trim();

  const slugs = [
    nombreToSlug(nombreSinForma),
    nombreToSlug(nombre),
  ];

  for (const slug of slugs) {
    const url = `https://empresite.eleconomista.es/${slug}.html`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        console.log(`  ⚠️  429 rate limit — esperando 10s...`);
        await sleep(10000);
        return null;
      }
      if (res.status === 404) continue;
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      // Verificar que el CIF coincide
      const jsonLd = $('script[type="application/ld+json"]').first().html();
      if (!jsonLd) continue;

      const data = JSON.parse(jsonLd);
      const entity = data?.mainEntity?.mainEntity;
      if (!entity) continue;

      // Verificar CIF
      const pageCif = (entity.taxID || '').replace(/^0/, '');
      if (pageCif.toUpperCase() !== cif.toUpperCase()) continue;

      const address = entity.address || {};
      const contacts = entity.contactPoint || [];
      const tel = contacts.find((c: any) => c.telephone)?.telephone || null;
      const email = contacts.find((c: any) => c.email)?.email || null;
      const empleados = entity.numberOfEmployees?.value || null;

      return {
        streetAddress: address.streetAddress || null,
        postalCode: address.postalCode || null,
        locality: address.addressLocality || null,
        region: address.addressRegion || null,
        telefono: tel,
        web: entity.url || null,
        email: email,
        empleados: empleados ? parseInt(empleados) : null,
      };
    } catch (err: any) {
      if (err.name === 'TimeoutError') continue;
      continue;
    }
  }
  return null;
}

async function main() {
  const empresas = await prisma.$queryRaw<{ id: number; cif: string; nombre: string; web: string | null; telefono: string | null }[]>`
    SELECT id, cif, nombre, web, telefono
    FROM "Empresa"
    WHERE (direccion IS NULL OR direccion = '')
      AND ("codigoPostal" IS NULL OR "codigoPostal" = '')
      AND (localidad IS NULL OR localidad = '')
      AND cif ~ '^[A-Za-z]'
    ORDER BY nombre
  `;

  console.log(`📋 ${empresas.length} empresas sin datos de ubicación (CIF con letra)\n`);

  let found = 0, notFound = 0, errors = 0;

  for (let i = 0; i < empresas.length; i++) {
    const emp = empresas[i];
    await sleep(DELAY_MS);

    const data = await scrapeEmpresiteByCif(emp.cif, emp.nombre);

    if (data && (data.streetAddress || data.postalCode || data.locality)) {
      found++;
      const update: Record<string, any> = {};
      if (data.streetAddress) update.direccion = data.streetAddress;
      if (data.postalCode) update.codigoPostal = data.postalCode;
      if (data.locality) update.localidad = data.locality;
      if (data.region) update.provincia = data.region;
      if (data.web && !emp.web) update.web = data.web;
      if (data.telefono && !emp.telefono) update.telefono = data.telefono;

      await prisma.empresa.update({ where: { id: emp.id }, data: update });
      console.log(`✅ [${i+1}/${empresas.length}] ${emp.cif} ${emp.nombre} → ${data.streetAddress || '-'}, ${data.locality || '-'}, ${data.postalCode || '-'}`);
    } else {
      notFound++;
      console.log(`❌ [${i+1}/${empresas.length}] ${emp.cif} ${emp.nombre}`);
    }
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`RESUMEN`);
  console.log(`${'='.repeat(64)}`);
  console.log(`Encontradas: ${found}`);
  console.log(`No encontradas: ${notFound}`);
  console.log(`${'='.repeat(64)}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
