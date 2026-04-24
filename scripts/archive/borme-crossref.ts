/**
 * borme-crossref.ts
 * Busca un nombre de persona en los PDFs del BORME para ver
 * en qué empresas aparece — detecta conexiones entre compañías.
 *
 * Uso: npx tsx scripts/borme-crossref.ts "VILLEN MARTA" [dias=7]
 */

import { PDFParse } from "pdf-parse";
import { fetchBormeSumario, lastWorkdays } from "../src/lib/borme";

function normalizeText(t: string): string {
  return t.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parsePdfEntradas(text: string) {
  const entryPattern = /^(\d{5,7})\s*-\s*(.+)$/gm;
  const starts: Array<{ index: number; numero: string; nombre: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = entryPattern.exec(text)) !== null)
    starts.push({ index: m.index, numero: m[1], nombre: m[2].trim().replace(/\.$/, "") });

  return starts.map((s, i) => {
    const blockStart = s.index + s.numero.length + 3 + s.nombre.length + 1;
    const blockEnd = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const texto = text.slice(blockStart, blockEnd).replace(/\s+/g, " ").trim();
    return { numero: s.numero, nombre: s.nombre, texto };
  });
}

async function fetchPdfText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Fontiber-WarRoom/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const r = await parser.getText();
  await parser.destroy();
  return r.text;
}

async function main() {
  const persona = process.argv[2];
  const nDias = parseInt(process.argv[3] ?? "7");

  if (!persona) {
    console.error("Uso: npx tsx scripts/borme-crossref.ts \"APELLIDO NOMBRE\" [dias=7]");
    process.exit(1);
  }

  const personaNorm = normalizeText(persona);
  const dias = lastWorkdays(nDias);

  console.log(`\n🔍  Buscando persona: "${persona}" (normalizado: "${personaNorm}")`);
  console.log(`    Últimos ${nDias} días hábiles: ${dias[dias.length - 1]} → ${dias[0]}\n`);

  interface Aparicion {
    fecha: string;
    provincia: string;
    empresa: string;
    numero: string;
    textoActo: string;
  }
  const apariciones: Aparicion[] = [];

  for (const dia of dias) {
    let items;
    try { items = await fetchBormeSumario(dia); } catch (e) { continue; }
    if (!items.length) continue;

    process.stdout.write(`  ${dia} (${items.length} PDFs) `);
    let found = 0;

    for (const item of items) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const txt = await fetchPdfText(item.url_pdf);
        const txtNorm = normalizeText(txt);
        if (!txtNorm.includes(personaNorm)) continue;

        // Hay match — encontrar qué entradas la mencionan
        const entradas = parsePdfEntradas(txt);
        for (const e of entradas) {
          if (normalizeText(e.texto).includes(personaNorm) ||
              normalizeText(e.nombre).includes(personaNorm)) {
            found++;
            apariciones.push({
              fecha: dia,
              provincia: item.titulo,
              empresa: e.nombre,
              numero: e.numero,
              textoActo: e.texto.slice(0, 400),
            });
          }
        }
      } catch (_) {}
    }

    if (found > 0) console.log(`✅  ${found} aparición(es)`);
    else process.stdout.write(`\r  ${dia} ok                        \r`);
  }

  // Resumen
  console.log(`\n\n${"═".repeat(65)}`);
  console.log(`APARICIONES DE: "${persona}"`);
  console.log(`${"═".repeat(65)}`);
  console.log(`Total: ${apariciones.length} apariciones en ${nDias} días\n`);

  if (apariciones.length === 0) {
    console.log("⚪  No encontrado en este período.");
    return;
  }

  // Agrupar por empresa
  const porEmpresa = new Map<string, Aparicion[]>();
  for (const a of apariciones) {
    const key = a.empresa;
    if (!porEmpresa.has(key)) porEmpresa.set(key, []);
    porEmpresa.get(key)!.push(a);
  }

  console.log(`Empresas en las que aparece: ${porEmpresa.size}\n`);

  for (const [empresa, acts] of porEmpresa) {
    console.log(`  📌 ${empresa} (${acts.length} acto(s))`);
    for (const a of acts) {
      const fecha = `${a.fecha.slice(0,4)}-${a.fecha.slice(4,6)}-${a.fecha.slice(6,8)}`;
      console.log(`     ${fecha} | ${a.provincia} | Nº ${a.numero}`);
      console.log(`     ${a.textoActo.slice(0, 150)}`);
    }
    console.log();
  }

  if (porEmpresa.size > 1) {
    console.log(`\n⚡  SEÑAL: "${persona}" aparece en ${porEmpresa.size} empresas distintas.`);
    console.log(`    Posible relación corporativa entre: ${[...porEmpresa.keys()].join(" ↔ ")}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
