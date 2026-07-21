import type { CellObject, SheetData } from "write-excel-file/browser";

export type EmpresaExportRow = {
  id: number;
  nombre: string;
  cif: string | null;
};

export type FinancieroExportRecord = {
  empresaId: number;
  anio: number;
  ingresos: number | null;
  margenBruto: number | null;
  ebitda: number | null;
};

const FINANCIAL_FORMAT = "#,##0;[Red](#,##0);-";
const PERCENT_FORMAT = "0.0%;[Red](0.0%);-";

export function excelHeaderCell(
  value: string | number,
  align: "left" | "center" | "right" = "left"
): CellObject {
  return {
    value,
    fontWeight: "bold",
    textColor: "#FFFFFF",
    backgroundColor: "#1F2937",
    align,
    alignVertical: "center",
    bottomBorderColor: "#111827",
    bottomBorderStyle: "medium",
    wrap: true,
  };
}

function financialCell(value: number | null): CellObject | null {
  if (value == null) return null;
  return { value, format: FINANCIAL_FORMAT, align: "right" };
}

function percentageCell(
  numerator: number | null,
  denominator: number | null
): CellObject | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return {
    value: numerator / denominator,
    format: PERCENT_FORMAT,
    align: "right",
  };
}

/**
 * Construye una matriz financiera de lectura horizontal:
 * Empresa | CIF | Métrica | 2020 | 2021 | ... | último año disponible.
 *
 * Se repiten Empresa/CIF en cada métrica para que Excel pueda filtrar u
 * ordenar sin depender de celdas combinadas.
 */
export function buildFinancialHistorySheet(
  companies: EmpresaExportRow[],
  records: FinancieroExportRecord[]
): { data: SheetData; years: number[] } {
  const usableRecords = records.filter((record) => record.anio >= 2020);
  const maxYear = Math.max(2020, ...usableRecords.map((record) => record.anio));
  const years = Array.from(
    { length: maxYear - 2020 + 1 },
    (_, index) => 2020 + index
  );

  const recordByCompanyYear = new Map<string, FinancieroExportRecord>();
  for (const record of usableRecords) {
    recordByCompanyYear.set(`${record.empresaId}:${record.anio}`, record);
  }

  const metrics: Array<{
    label: string;
    value: (record: FinancieroExportRecord | undefined) => CellObject | null;
  }> = [
    {
      label: "Ingresos (€)",
      value: (record) => financialCell(record?.ingresos ?? null),
    },
    {
      label: "Margen bruto (€)",
      value: (record) => financialCell(record?.margenBruto ?? null),
    },
    {
      label: "Margen bruto (%)",
      value: (record) =>
        percentageCell(record?.margenBruto ?? null, record?.ingresos ?? null),
    },
    {
      label: "EBITDA (€)",
      value: (record) => financialCell(record?.ebitda ?? null),
    },
    {
      label: "EBITDA (%)",
      value: (record) =>
        percentageCell(record?.ebitda ?? null, record?.ingresos ?? null),
    },
  ];

  const data: SheetData = [
    [
      excelHeaderCell("Empresa"),
      excelHeaderCell("CIF"),
      excelHeaderCell("Métrica"),
      ...years.map((year) => excelHeaderCell(year, "right")),
    ],
  ];

  for (const company of companies) {
    for (const metric of metrics) {
      data.push([
        company.nombre,
        company.cif ?? "",
        metric.label,
        ...years.map((year) =>
          metric.value(recordByCompanyYear.get(`${company.id}:${year}`))
        ),
      ]);
    }
  }

  return { data, years };
}
