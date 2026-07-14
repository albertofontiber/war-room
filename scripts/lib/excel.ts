import readExcelFile, { type SheetData } from "read-excel-file/node";

type EmptyCellValue = "" | null;

/**
 * Lee todas las hojas del libro. Mantener esta adaptación aquí evita que los
 * scripts de importación dependan de una librería de Excel sin mantenimiento.
 */
export async function readWorkbook(filePath: string) {
  return readExcelFile(filePath);
}

/**
 * Convierte una hoja con la primera fila como cabecera a objetos planos.
 * Omite filas totalmente vacías, igual que hacía la importación anterior.
 */
export function sheetDataToRecords(
  data: SheetData,
  options: { headerRow?: number; emptyValue?: EmptyCellValue } = {}
): Record<string, unknown>[] {
  const { headerRow = 0, emptyValue = null } = options;
  const headers = data[headerRow] ?? [];

  return data
    .slice(headerRow + 1)
    .filter((row) => row.some((cell) => cell !== null && cell !== ""))
    .map((row) => {
      const record: Record<string, unknown> = {};

      for (let column = 0; column < headers.length; column += 1) {
        const header = headers[column];
        const key =
          header == null || String(header).trim() === ""
            ? `__COL_${column}`
            : String(header);
        record[key] = row[column] ?? emptyValue;
      }

      return record;
    });
}
