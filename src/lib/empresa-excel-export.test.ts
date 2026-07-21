import { describe, expect, it } from "vitest";
import {
  buildFinancialHistorySheet,
  type FinancieroExportRecord,
} from "./empresa-excel-export";

function cellValue(cell: unknown): unknown {
  if (cell && typeof cell === "object" && "value" in cell) {
    return (cell as { value?: unknown }).value;
  }
  return cell;
}

describe("buildFinancialHistorySheet", () => {
  const companies = [
    { id: 2, nombre: "Beta SL", cif: "B22222222" },
    { id: 1, nombre: "Alpha SA", cif: "A11111111" },
  ];

  const records: FinancieroExportRecord[] = [
    { empresaId: 1, anio: 2019, ingresos: 50, margenBruto: 20, ebitda: 5 },
    { empresaId: 1, anio: 2020, ingresos: 100, margenBruto: 40, ebitda: 10 },
    { empresaId: 1, anio: 2024, ingresos: 200, margenBruto: 80, ebitda: 30 },
    { empresaId: 2, anio: 2022, ingresos: 0, margenBruto: 0, ebitda: 0 },
  ];

  it("crea columnas consecutivas desde 2020 hasta el máximo disponible", () => {
    const { data, years } = buildFinancialHistorySheet(companies, records);
    expect(years).toEqual([2020, 2021, 2022, 2023, 2024]);
    expect(data[0].map(cellValue)).toEqual([
      "Empresa",
      "CIF",
      "Métrica",
      2020,
      2021,
      2022,
      2023,
      2024,
    ]);
  });

  it("mantiene el orden visible de empresas y cinco métricas por empresa", () => {
    const { data } = buildFinancialHistorySheet(companies, records);
    expect(data).toHaveLength(1 + companies.length * 5);
    expect(data.slice(1, 6).map((row) => row.slice(0, 3).map(cellValue))).toEqual([
      ["Beta SL", "B22222222", "Ingresos (€)"],
      ["Beta SL", "B22222222", "Margen bruto (€)"],
      ["Beta SL", "B22222222", "Margen bruto (%)"],
      ["Beta SL", "B22222222", "EBITDA (€)"],
      ["Beta SL", "B22222222", "EBITDA (%)"],
    ]);
    expect(cellValue(data[6][0])).toBe("Alpha SA");
  });

  it("calcula porcentajes como ratios Excel y deja vacío si ingresos es cero", () => {
    const { data, years } = buildFinancialHistorySheet(companies, records);
    const y2020 = 3 + years.indexOf(2020);
    const y2022 = 3 + years.indexOf(2022);

    // Alpha ocupa las filas 6..10: GM%=fila 8, EBITDA%=fila 10.
    expect(cellValue(data[8][y2020])).toBe(0.4);
    expect(cellValue(data[10][y2020])).toBe(0.1);
    // Beta con ingresos cero no fuerza una división inválida.
    expect(data[3][y2022]).toBeNull();
    expect(data[5][y2022]).toBeNull();
  });

  it("ignora ejercicios anteriores a 2020", () => {
    const { years } = buildFinancialHistorySheet(companies, [records[0]]);
    expect(years).toEqual([2020]);
  });
});
