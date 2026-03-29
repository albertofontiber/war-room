/**
 * borme-inspect.ts
 * Inspecciona el XML real del BORME para entender la estructura antes de implementar el parser.
 * Uso: npx tsx scripts/borme-inspect.ts
 */

const BASE = "https://www.boe.es/diario_borme/xml.php?id=";
const HEADERS = { "User-Agent": "Fontiber-WarRoom/1.0 (internal research tool)" };

async function fetchXml(id: string): Promise<string> {
  const res = await fetch(`${BASE}${id}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`);
  return res.text();
}

// Busca el último día hábil disponible (hacia atrás desde hoy)
function lastWorkdays(n: number): string[] {
  const days: string[] = [];
  const d = new Date();
  while (days.length < n) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // fin de semana
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    days.push(`${yyyy}${mm}${dd}`);
  }
  return days;
}

async function main() {
  const [date] = lastWorkdays(1);
  console.log(`\n🔍  Inspeccionando BORME del ${date}\n`);

  // 1. Sumario del día
  const summaryId = `BORME-S-${date}`;
  console.log(`── Sumario: ${summaryId}`);
  let summaryXml: string;
  try {
    summaryXml = await fetchXml(summaryId);
  } catch (e) {
    console.error("Error fetching summary:", e);
    return;
  }

  // Mostrar primeros 3000 chars del sumario
  console.log("\n[SUMARIO XML — primeros 3000 chars]:");
  console.log(summaryXml.slice(0, 3000));
  console.log("...\n");

  // Extraer todos los id= que sean BORME-A-*
  const itemIds = [...summaryXml.matchAll(/id="(BORME-A-[^"]+)"/g)].map(m => m[1]);
  console.log(`\n📋  IDs sección A encontrados: ${itemIds.length}`);
  console.log("  Primeros 5:", itemIds.slice(0, 5));

  if (itemIds.length === 0) {
    console.log("⚠️  No se encontraron IDs. Revisa el formato del sumario.");
    return;
  }

  // 2. Primer acto individual
  const firstId = itemIds[0];
  console.log(`\n── Acto individual: ${firstId}`);
  await new Promise(r => setTimeout(r, 500));
  let actoXml: string;
  try {
    actoXml = await fetchXml(firstId);
  } catch (e) {
    console.error("Error fetching acto:", e);
    return;
  }

  console.log(`\n[ACTO XML — primeros 4000 chars]:`);
  console.log(actoXml.slice(0, 4000));
  console.log("...\n");

  // Buscar patrones de NIF / empresa en el XML
  const nifMatches = [...actoXml.matchAll(/[A-Z]\d{7}[A-Z0-9]/g)];
  console.log(`\n🔑  Posibles NIFs encontrados en el XML: ${nifMatches.length}`);
  console.log("  Ejemplos:", [...new Set(nifMatches.map(m => m[0]))].slice(0, 10));

  // Buscar tags relacionados con empresa/acto
  const tags = [...new Set([...actoXml.matchAll(/<([a-zA-Z][a-zA-Z0-9_-]*)[^>]*>/g)].map(m => m[1]))];
  console.log(`\n🏷️  Tags XML únicos encontrados: ${tags.join(", ")}`);
}

main().catch(console.error);
