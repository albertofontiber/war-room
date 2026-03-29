/**
 * borme-test.ts
 * Smoke-test del parser BORME — lee-only, sin escrituras en DB.
 *
 * Descarga el último BORME disponible, extrae todas las entradas y
 * cruza contra empresa.nombre de la DB para ver cuántas coincidencias
 * encontramos y con qué calidad.
 *
 * Uso: npx tsx scripts/borme-test.ts
 */

import { PDFParse } from "pdf-parse";
import { prisma } from "../src/lib/prisma";
import {
  fetchBormeSumario,
  normalizeNombre,
  lastWorkdays,
} from "../src/lib/borme";

// ─── Mismas funciones de parseo que borme.ts (inline para el test) ────────────

function coreNombre(normalized: string): string {
  return normalized
    .replace(/\s+(SAU|SLU|SLP|SAL|SCOOP|SA|SL|CB|SAT)\s*$/, "")
    .trim();
}

function classifyActo(texto: string): string {
  const t = texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/DISOLUCION|LIQUIDACION|EXTINCION|CANCELACION/.test(t)) return "disolucion";
  if (/FUSION|ABSORCION|ESCISION/.test(t)) return "fusion";
  if (/ADQUISICION|COMPRAVENTA|CESION.*PARTICIPACION/.test(t)) return "adquisicion";
  if (/CAMBIO.*TITULAR|TRANSMISION.*PARTICIPACION/.test(t)) return "cambio_titular";
  return "otros";
}

async function fetchPdfText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Fontiber-WarRoom/1.0 (internal research tool)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

function parseEntradas(text: string) {
  const entryPattern = /^(\d{5,7})\s*-\s*(.+)$/gm;
  const starts: Array<{ index: number; numero: string; nombre: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = entryPattern.exec(text)) !== null) {
    starts.push({ index: m.index, numero: m[1], nombre: m[2].trim().replace(/\.$/, "").trim() });
  }
  return starts.map((s, i) => {
    const blockStart = s.index + s.numero.length + 3 + s.nombre.length + 1;
    const blockEnd = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const texto = text.slice(blockStart, blockEnd).replace(/\s+/g, " ").trim().slice(0, 400);
    return { numero: s.numero, nombre: s.nombre, texto, tipo: classifyActo(texto) };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [dateStr] = lastWorkdays(1);
  console.log(`\n🔍  Test BORME — ${dateStr}\n`);

  // 1. Sumario
  const items = await fetchBormeSumario(dateStr);
  if (!items.length) {
    console.log("⚪  Sin BORME para este día.");
    return;
  }
  console.log(`📋  ${items.length} PDFs en Sección A\n`);

  // 2. Construir mapa de nombres
  const empresas = await prisma.empresa.findMany({ select: { id: true, nombre: true, cif: true } });
  const nombreToEmpresa = new Map<string, { id: number; nombre: string; cif: string }>();
  const coreToEmpresa = new Map<string, { id: number; nombre: string; cif: string }>();
  for (const e of empresas) {
    const norm = normalizeNombre(e.nombre);
    const core = coreNombre(norm);
    if (norm && !nombreToEmpresa.has(norm)) nombreToEmpresa.set(norm, e);
    if (core && core !== norm && !coreToEmpresa.has(core)) coreToEmpresa.set(core, e);
  }
  console.log(`🏢  ${empresas.length} empresas en DB cargadas\n`);

  // 3. Procesar TODOS los PDFs (o los primeros N para el test)
  const MAX_PDFS = items.length; // ponlo a e.g. 3 si quieres acelerar el test
  const matches: Array<{
    fecha: string; bormeName: string; dbNombre: string; cif: string; tipo: string; matchType: string;
  }> = [];
  let totalEntradas = 0;

  for (let i = 0; i < Math.min(MAX_PDFS, items.length); i++) {
    const item = items[i];
    process.stdout.write(`  [${i + 1}/${Math.min(MAX_PDFS, items.length)}] ${item.titulo.padEnd(30)} `);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const txt = await fetchPdfText(item.url_pdf);
      const entradas = parseEntradas(txt);
      totalEntradas += entradas.length;

      let hits = 0;
      for (const e of entradas) {
        const norm = normalizeNombre(e.nombre);
        const core = coreNombre(norm);
        const emp = nombreToEmpresa.get(norm) ?? coreToEmpresa.get(core);
        if (emp) {
          hits++;
          matches.push({
            fecha: dateStr,
            bormeName: e.nombre,
            dbNombre: emp.nombre,
            cif: emp.cif,
            tipo: e.tipo,
            matchType: nombreToEmpresa.has(norm) ? "exact" : "core",
          });
        }
      }
      console.log(`${entradas.length} entradas  →  ${hits} matches`);
    } catch (err) {
      console.log(`ERROR: ${err}`);
    }
  }

  // 4. Resumen
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Total entradas procesadas: ${totalEntradas}`);
  console.log(`Matches encontrados:       ${matches.length}`);

  if (matches.length > 0) {
    console.log(`\n✅  Empresas encontradas en el BORME de hoy:`);
    for (const m of matches) {
      console.log(`\n  CIF: ${m.cif}`);
      console.log(`  BORME:  "${m.bormeName}"`);
      console.log(`  DB:     "${m.dbNombre}"`);
      console.log(`  Tipo:   ${m.tipo}  (match: ${m.matchType})`);
    }
  } else {
    console.log(`\n⚪  Ninguna de las ${empresas.length} empresas de la DB apareció en el BORME de hoy.`);
    console.log(`    (Normal si ninguna tuvo actos registrales ese día)`);

    // Muestra algunos ejemplos del BORME para verificar que el formato se parsea bien
    console.log(`\n── Muestra de 5 entradas parseadas del BORME:`);
    const item = items[0];
    try {
      const txt = await fetchPdfText(item.url_pdf);
      const entradas = parseEntradas(txt);
      entradas.slice(0, 5).forEach((e) => {
        console.log(`  [${e.numero}] "${e.nombre}" → ${e.tipo}`);
        console.log(`          ${e.texto.slice(0, 100)}`);
      });
    } catch (_) { /* ya se informó */ }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
