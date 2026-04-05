/**
 * scrape-empresia.ts
 * Scraping puntual de empresia.es para poblar PersonaCargo + enriquecer Empresa.
 *
 * Extrae por cada empresa:
 *   - Cargos actuales (td-relent-hasta vacío = vigente)
 *   - Dirección, localidad, código postal
 *   - Año de constitución
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/scrape-empresia.ts
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/scrape-empresia.ts --offset 500   # reanudar
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/scrape-empresia.ts --cif B86743325 # test individual
 */

import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import { normalizePersona } from '../src/lib/normalize';

require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

// ── Throttling ────────────────────────────────────────────────────────────────
const DELAY_MS = 1200;          // ~3 req/s — conservador para no ser baneado
const BATCH_LOG = 50;           // log cada N empresas
const MAX_RETRIES = 2;

function normalizeRol(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r.includes('administrador único') || r.includes('administrador unico') || r === 'adm. único' || r === 'adm. unico') return 'administrador_unico';
  if (r.includes('administrador solidario') || r === 'adm. solid.') return 'administrador_solidario';
  if (r.includes('administrador mancomunado') || r === 'adm. mancom.') return 'administrador_mancomunado';
  if (r.includes('administrador') || r.startsWith('adm.')) return 'administrador';
  if (r.includes('consejero delegado') || r === 'cons. deleg.') return 'consejero_delegado';
  if (r.includes('presidente') || r === 'presid.') return 'presidente';
  if (r.includes('consejero') || r.startsWith('consej.') || r === 'cons.') return 'consejero';
  if (r.includes('secretario') || r === 'secr.') return 'secretario';
  if (r.includes('apoderado solidario') || r === 'apod. solid.') return 'apoderado_solidario';
  if (r.includes('apoderado mancomunado') || r === 'apod. mancom.') return 'apoderado_mancomunado';
  if (r.includes('apoderado') || r.startsWith('apod.')) return 'apoderado';
  if (r.includes('liquidador')) return 'liquidador';
  if (r.includes('auditor')) return 'auditor';
  return r.replace(/\s+/g, '_').slice(0, 50);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface ScrapedData {
  cargos: { nombreOrig: string; nombreNorm: string; rol: string; fechaDesde: Date | null; esJuridica: boolean }[];
  direccion: string | null;
  localidad: string | null;
  codigoPostal: string | null;
  anioConstitucion: number | null;
}

async function scrapeEmpresa(cif: string, retries = 0): Promise<ScrapedData | null> {
  const url = `https://empresia.es/empresa/${cif.toLowerCase()}/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 404) return null; // empresa no encontrada
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    // ── Cargos actuales ──────────────────────────────────────────────────────
    const cargos: ScrapedData['cargos'] = [];
    $('tr').each((_, row) => {
      const hasta = $(row).find('.td-relent-hasta').text().trim();
      if (hasta) return; // tiene fecha de fin → cesado, ignorar

      const nombreOrig = $(row).find('.td-relent-entidad').first().text().trim();
      const rolRaw = $(row).find('.td-relent-relacion').first().text().trim();
      const desdeRaw = $(row).find('.td-relent-desde').first().text().trim();

      if (!nombreOrig || !rolRaw) return;

      // Detectar si es persona jurídica (icono fa-building) o física (fa-user-circle-o)
      const esJuridica = $(row).find('i.fa-building').length > 0;

      // Excluir socios/accionistas — solo nos interesan cargos directivos
      const rolLower = rolRaw.toLowerCase();
      if (rolLower.includes('socio') || rolLower.includes('accionista')) return;

      let fechaDesde: Date | null = null;
      if (desdeRaw && /\d{2}\/\d{2}\/\d{4}/.test(desdeRaw)) {
        const [d, m, y] = desdeRaw.split('/');
        fechaDesde = new Date(`${y}-${m}-${d}`);
      }

      const nombreNorm = normalizePersona(nombreOrig, esJuridica);
      const rol = normalizeRol(rolRaw);

      // Si ya existe este nombreNorm, quedarse con el rol de fechaDesde más reciente
      const existing = cargos.find(c => c.nombreNorm === nombreNorm);
      if (existing) {
        const existingMs = existing.fechaDesde?.getTime() ?? 0;
        const newMs = fechaDesde?.getTime() ?? 0;
        if (newMs > existingMs) {
          existing.nombreOrig = nombreOrig;
          existing.rol = rol;
          existing.fechaDesde = fechaDesde;
          existing.esJuridica = esJuridica;
        }
        return; // no añadir duplicado
      }

      cargos.push({ nombreOrig, nombreNorm, rol, fechaDesde, esJuridica });
    });

    // ── Dirección ────────────────────────────────────────────────────────────
    // Patrón: <i class="fa fa-address-book"> seguido del texto de dirección antes del link de Maps
    let direccion: string | null = null;
    let localidad: string | null = null;
    let codigoPostal: string | null = null;

    // Dirección: texto tras el icono fa-address-book, hasta el enlace de Maps
    const addrEl = $('i.fa-address-book').first().parent();
    if (addrEl.length) {
      const raw = addrEl.text().replace(/Ver mapa.*$/i, '').trim();
      if (raw.length > 3) {
        // Extraer CP (5 dígitos) si existe
        const cpMatch = raw.match(/\b(\d{5})\b/);
        if (cpMatch) codigoPostal = cpMatch[1];
        // Limpiar CP y punto final
        direccion = raw.replace(/\b\d{5}\b/, '').replace(/\.$/, '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
      }
    }

    // Localidad: meta description contiene "de MUNICIPIO con los anuncios"
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const localidadMatch = metaDesc.match(/ de ([^c]+) con los anuncios/i);
    if (localidadMatch) localidad = localidadMatch[1].trim().slice(0, 100);

    // ── Año de constitución ──────────────────────────────────────────────────
    // Patrón: <span>Fecha constitución</span><p class="list-group-item-text">DD/MM/YYYY</p>
    let anioConstitucion: number | null = null;
    $('span.list-group-item-heading').each((_, el) => {
      if ($(el).text().toLowerCase().includes('fecha constituci')) {
        const val = $(el).next('p').text().trim();
        const m = val.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) anioConstitucion = parseInt(m[3]);
      }
    });

    return { cargos, direccion, localidad, codigoPostal, anioConstitucion };

  } catch (err: any) {
    if (retries < MAX_RETRIES) {
      await sleep(3000);
      return scrapeEmpresa(cif, retries + 1);
    }
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const offsetArg = args.find(a => a.startsWith('--offset=') || args[args.indexOf('--offset') + 1]);
  const cifArg = args.find(a => a.startsWith('--cif='))?.split('=')[1]
    || (args.includes('--cif') ? args[args.indexOf('--cif') + 1] : null);
  const offset = offsetArg ? parseInt(offsetArg.replace('--offset=', '')) || 0 : 0;

  // ── Modo test: una sola empresa ──────────────────────────────────────────
  if (cifArg) {
    console.log(`🔍 Test para CIF: ${cifArg}`);
    const data = await scrapeEmpresa(cifArg);
    console.log(JSON.stringify(data, null, 2));
    await prisma.$disconnect();
    return;
  }

  // ── Modo completo ────────────────────────────────────────────────────────
  const empresas = await prisma.empresa.findMany({
    select: { id: true, cif: true, nombre: true },
    orderBy: { id: 'asc' },
    skip: offset,
  });

  console.log(`📋 ${empresas.length} empresas a procesar (offset=${offset})`);
  console.log(`⏱  Tiempo estimado: ~${Math.round(empresas.length * DELAY_MS / 1000 / 60)} minutos\n`);

  let processed = 0, found = 0, notFound = 0, errors = 0, cargosTotal = 0;

  for (const empresa of empresas) {
    const data = await scrapeEmpresa(empresa.cif);

    if (data === null) {
      notFound++;
    } else {
      found++;
      cargosTotal += data.cargos.length;

      // Actualizar Empresa (solo si tenemos datos nuevos)
      const empresaUpdate: Record<string, any> = {};
      if (data.direccion) empresaUpdate.direccion = data.direccion;
      if (data.localidad) empresaUpdate.localidad = data.localidad;
      if (data.codigoPostal) empresaUpdate.codigoPostal = data.codigoPostal;
      if (data.anioConstitucion) empresaUpdate.anioConstitucion = data.anioConstitucion;

      if (Object.keys(empresaUpdate).length > 0) {
        await prisma.empresa.update({ where: { id: empresa.id }, data: empresaUpdate });
      }

      // Marcar como vigente=false los cargos previos que ya no aparecen en este scraping
      const nuevosNombres = new Set(data.cargos.map(c => c.nombreNorm));
      await prisma.personaCargo.updateMany({
        where: {
          empresaId: empresa.id,
          fuente: 'empresia',
          vigente: true,
          nombreNorm: { notIn: [...nuevosNombres] },
        },
        data: { vigente: false },
      });

      // Upsert PersonaCargo (solo cargos vigentes)
      for (const cargo of data.cargos) {
        if (!cargo.nombreNorm || cargo.nombreNorm.length < 2) continue;
        try {
          await prisma.personaCargo.upsert({
            where: { empresaId_nombreNorm: { empresaId: empresa.id, nombreNorm: cargo.nombreNorm } },
            create: {
              empresaId: empresa.id,
              nombreNorm: cargo.nombreNorm,
              nombreOrig: cargo.nombreOrig,
              rol: cargo.rol,
              fechaDesde: cargo.fechaDesde,
              esJuridica: cargo.esJuridica,
              vigente: true,
              fuente: 'empresia',
            },
            update: {
              nombreOrig: cargo.nombreOrig,
              rol: cargo.rol,
              fechaDesde: cargo.fechaDesde,
              esJuridica: cargo.esJuridica,
              vigente: true,
              fuente: 'empresia',
              scrapedAt: new Date(),
            },
          });
        } catch (_) {
          // Ignorar conflictos de unique (mismo nombreNorm normalizado distinto nombreOrig)
        }
      }
    }

    processed++;
    if (processed % BATCH_LOG === 0) {
      console.log(`[${processed}/${empresas.length}] ✅ encontradas: ${found} | ❌ no encontradas: ${notFound} | cargos: ${cargosTotal}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n✅ Scraping completado:`);
  console.log(`   Procesadas: ${processed}`);
  console.log(`   Encontradas en empresia: ${found}`);
  console.log(`   No encontradas: ${notFound}`);
  console.log(`   Errores: ${errors}`);
  console.log(`   Cargos insertados/actualizados: ${cargosTotal}`);

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
