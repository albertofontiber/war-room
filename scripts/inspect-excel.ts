import * as XLSX from "xlsx";
import path from "path";

const filePath = process.argv[2];
if (!filePath) { console.error("Uso: npx tsx scripts/inspect-excel.ts <ruta>"); process.exit(1); }

const wb = XLSX.readFile(path.resolve(filePath), { cellDates: false });
console.log("Pestañas:", wb.SheetNames);

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];

  // Raw arrays
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  console.log(`\n[${sheetName}] — ${raw.length} filas brutas`);
  for (let i = 0; i < Math.min(4, raw.length); i++) {
    const row = raw[i] as unknown[];
    console.log(`  Fila ${i}:`, JSON.stringify(row.slice(0, 8)));
  }

  // Método nuevo: localizar fila de cabecera y construir objetos manualmente
  const headerRowIdx = raw.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").toUpperCase().includes("CIF"))
  );
  if (headerRowIdx === -1) { console.log("  ❌ No se encontró fila de cabecera"); continue; }

  const headers = raw[headerRowIdx] as unknown[];
  const dataRows: Record<string, unknown>[] = [];
  for (let r = headerRowIdx + 1; r < raw.length; r++) {
    const dataRow = raw[r] as unknown[];
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] != null ? String(headers[c]) : `__COL_${c}`;
      obj[key] = dataRow[c] ?? null;
    }
    dataRows.push(obj);
  }

  console.log(`\n  Con método manual (cabecera en fila ${headerRowIdx}) → ${dataRows.length} filas`);
  if (dataRows.length > 0) {
    console.log("\n  ── TODAS LAS COLUMNAS ──");
    Object.keys(dataRows[0]).forEach((k, i) => {
      console.log(`  [${i}] "${k}"  →  ${JSON.stringify(dataRows[0][k])}`);
    });
    console.log("\n  ── PRIMERA FILA COMPLETA ──");
    console.log(JSON.stringify(dataRows[0], null, 2));
  }
}
