import path from "path";
import { readWorkbook } from "./lib/excel";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: npx tsx scripts/inspect-excel.ts <ruta>");
  process.exit(1);
}

async function main() {
  const workbook = await readWorkbook(path.resolve(filePath));
  console.log("Pestañas:", workbook.map(({ sheet }) => sheet));

  for (const { sheet: sheetName, data: raw } of workbook) {
    console.log(`\n[${sheetName}] — ${raw.length} filas brutas`);
    for (let i = 0; i < Math.min(4, raw.length); i += 1) {
      const row = raw[i];
      console.log(`  Fila ${i}:`, JSON.stringify(row.slice(0, 8)));
    }

    const headerRowIdx = raw.findIndex(
      (row) => row.some((cell) => String(cell ?? "").toUpperCase().includes("CIF"))
    );
    if (headerRowIdx === -1) {
      console.log("  ❌ No se encontró fila de cabecera");
      continue;
    }

    const headers = raw[headerRowIdx];
    const dataRows: Record<string, unknown>[] = [];
    for (let rowIndex = headerRowIdx + 1; rowIndex < raw.length; rowIndex += 1) {
      const dataRow = raw[rowIndex];
      const row: Record<string, unknown> = {};
      for (let column = 0; column < headers.length; column += 1) {
        const key = headers[column] != null ? String(headers[column]) : `__COL_${column}`;
        row[key] = dataRow[column] ?? null;
      }
      dataRows.push(row);
    }

    console.log(`\n  Con método manual (cabecera en fila ${headerRowIdx}) → ${dataRows.length} filas`);
    if (dataRows.length > 0) {
      console.log("\n  ——— TODAS LAS COLUMNAS ———");
      Object.keys(dataRows[0]).forEach((key, index) => {
        console.log(`  [${index}] "${key}"  →  ${JSON.stringify(dataRows[0][key])}`);
      });
      console.log("\n  ——— PRIMERA FILA COMPLETA ———");
      console.log(JSON.stringify(dataRows[0], null, 2));
    }
  }
}

void main();
