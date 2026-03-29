/**
 * borme-buscar-empresa.ts
 * Busca una empresa concreta en los BORMEs de los últimos N meses.
 * Solo descarga el PDF de su provincia — sin tocar la DB.
 *
 * Uso: npx tsx scripts/borme-buscar-empresa.ts "FIRE BUSINESS" [meses=6]
 */

import { PDFParse } from "pdf-parse";
import { fetchBormeSumario, normalizeNombre, workingDaysBetween } from "../src/lib/borme";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function coreNombre(n: string) {
  return n.replace(/\s+(SAU|SLU|SLP|SAL|SCOOP|SA|SL|CB|SAT)\s*$/, "").trim();
}

function classifyActo(texto: string) {
  const t = texto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/DISOLUCION|LIQUIDACION|EXTINCION|CANCELACION/.test(t)) return "🔴 Disolución/Liquidación";
  if (/FUSION|ABSORCION|ESCISION/.test(t))                    return "🟠 Fusión/Absorción/Escisión";
  if (/ADQUISICION|COMPRAVENTA|CESION.*PARTICIPACION/.test(t)) return "🟡 Adquisición";
  if (/CAMBIO.*TITULAR|TRANSMISION.*PARTICIPACION/.test(t))    return "🟡 Cambio de titular";
  if (/NOMBRAMIENTO|CESE|REVOCACION|APODERADO/.test(t))       return "🔵 Nombramientos/Ceses";
  if (/CONSTITUCION/.test(t))                                 return "🟢 Constitución";
  if (/CAMBIO.*DOMICILIO|TRASLADO/.test(t))                   return "⚪ Cambio de domicilio";
  if (/AMPLIACION.*CAPITAL|REDUCCION.*CAPITAL/.test(t))       return "⚪ Ampliación/Reducción capital";
  return "⚪ Otros";
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const busqueda = process.argv[2] ?? "FIRE BUSINESS";
  const meses    = parseInt(process.argv[3] ?? "6");

  const normBusqueda = normalizeNombre(busqueda);
  const coreBusqueda = coreNombre(normBusqueda);

  console.log(`\n🔍  Buscando: "${busqueda}"`);
  console.log(`    Nombre normalizado: "${normBusqueda}"`);
  console.log(`    Nombre core:        "${coreBusqueda}"`);
  console.log(`    Período: últimos ${meses} meses\n`);

  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = new Date(endDate);
  startDate.setUTCMonth(startDate.getUTCMonth() - meses);

  const dias = workingDaysBetween(startDate, endDate);
  console.log(`    Días a revisar: ${dias.length}\n`);

  interface Hallazgo {
    fecha: string;
    provincia: string;
    nombreBorme: string;
    acto: string;
    textoCompleto: string;
    urlPdf: string;
    numero: string;
  }
  const hallazgos: Hallazgo[] = [];
  let diasConBorme = 0;
  let diasSinBorme = 0;
  let errores = 0;

  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i];
    process.stdout.write(`[${String(i+1).padStart(3)}/${dias.length}] ${dia} `);

    let items;
    try {
      items = await fetchBormeSumario(dia);
    } catch (err) {
      errores++;
      console.log(`ERROR sumario: ${err}`);
      continue;
    }

    if (items.length === 0) {
      diasSinBorme++;
      process.stdout.write(`(sin BORME)\r`);
      continue;
    }
    diasConBorme++;

    // Solo descargar PDFs de provincias relevantes si sabemos cuál es,
    // o todos si no lo sabemos. Para acelerar el test filtramos por palabras clave
    // que puedan indicar la provincia (opcional — aquí descargamos todos).
    let encontrado = false;
    for (const item of items) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const txt = await fetchPdfText(item.url_pdf);
        const entradas = parsePdfEntradas(txt);

        for (const e of entradas) {
          const normE = normalizeNombre(e.nombre);
          const coreE = coreNombre(normE);
          const match = normE === normBusqueda || coreE === coreBusqueda;
          if (match) {
            encontrado = true;
            hallazgos.push({
              fecha: dia,
              provincia: item.titulo,
              nombreBorme: e.nombre,
              acto: classifyActo(e.texto),
              textoCompleto: e.texto,
              urlPdf: item.url_pdf,
              numero: e.numero,
            });
          }
        }
      } catch (_) {
        // PDF individual fallido — seguimos
      }
    }

    if (encontrado) {
      console.log(`✅  ENCONTRADA`);
    } else {
      process.stdout.write(`ok (${items.length} PDFs)\r`);
    }
  }

  // ─── Resultado ──────────────────────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(65)}`);
  console.log(`RESULTADO PARA: "${busqueda}"`);
  console.log(`${"═".repeat(65)}`);
  console.log(`Días BORME revisados: ${diasConBorme}  |  Sin BORME: ${diasSinBorme}  |  Errores: ${errores}`);
  console.log(`Actos encontrados:    ${hallazgos.length}`);

  if (hallazgos.length === 0) {
    console.log(`\n⚪  No apareció en el BORME durante este período.`);
    console.log(`    Posibles razones:`);
    console.log(`    • No tuvo actos registrales en los últimos ${meses} meses`);
    console.log(`    • El nombre en el BORME difiere del buscado`);
  } else {
    console.log(`\n📋  Historial de actos BORME:\n`);
    hallazgos.forEach((h, idx) => {
      const fecha = `${h.fecha.slice(0,4)}-${h.fecha.slice(4,6)}-${h.fecha.slice(6,8)}`;
      console.log(`  ${idx+1}. ${fecha}  —  ${h.acto}`);
      console.log(`     Nombre en BORME:  "${h.nombreBorme}"`);
      console.log(`     Provincia:        ${h.provincia}`);
      console.log(`     Nº de registro:   ${h.numero}`);
      console.log(`     Texto del acto:`);
      // Mostrar el texto en bloques de 70 chars
      const palabras = h.textoCompleto.split(" ");
      let linea = "       ";
      for (const p of palabras) {
        if (linea.length + p.length > 72) {
          console.log(linea);
          linea = "       " + p + " ";
        } else {
          linea += p + " ";
        }
      }
      if (linea.trim()) console.log(linea);
      console.log(`     PDF fuente: ${h.urlPdf}`);
      console.log();
    });

    console.log(`\n💡  Qué se almacenaría en la base de datos:`);
    console.log(`     Modelo: BormeAlerta`);
    console.log(`     Campos:`);
    const h0 = hallazgos[0];
    const fecha0 = `${h0.fecha.slice(0,4)}-${h0.fecha.slice(4,6)}-${h0.fecha.slice(6,8)}`;
    console.log(`       empresaId   →  ID de la empresa en nuestra DB`);
    console.log(`       fecha       →  ${fecha0} (fecha de publicación en BORME)`);
    console.log(`       tipoActo    →  "otros" / "disolucion" / "fusion" / etc.`);
    console.log(`       descripcion →  "${h0.numero} — ${h0.textoCompleto.slice(0, 120)}..."`);
    console.log(`       urlBorme    →  ${h0.urlPdf}`);
    console.log(`       leido       →  false (se marcaría como leído desde el panel)`);
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
