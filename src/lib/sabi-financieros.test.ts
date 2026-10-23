import { describe, expect, it } from "vitest";
import { mapearColumnas, parsearFila } from "./sabi-financieros";
import { avisosFinancieros, estadoDesdeSabi, cargaFinancieros } from "./empresa-estado";

// Cabecera real de la pestaña "Copia Valores" de la extracción de oct 2026.
const SUF = ["Últ. año disp.", "Año - 1", "Año - 2", "Año - 3"];
const CABECERA = [
  "CIF", "Nombre", "C/U?", "SABI code (u)", "Ultimo año disponible", "Estado",
  "Número empleados Últ. año disp",
  ...SUF.map((s) => `Importe neto Cifra de Ventas mil EUR ${s}`),
  ...SUF.map((s) => `COGS (Aprovisionamientos) mil EUR ${s}`),
  ...SUF.map((s) => `MB mil EUR ${s}`),
  ...SUF.map((s) => `Resultado bruto mil EUR ${s}`),
  ...SUF.map((s) => `EBITDA mil EUR ${s}`),
  ...SUF.map((s) => `Resultado del Ejercicio mil EUR ${s}`),
];

const fila = (over: Partial<Record<string, unknown>>, valores: number[][]) => {
  const base: unknown[] = ["b54722392 ", "3D SEGURIDAD", "U", "0B54722392U", 2025, "Active", 151];
  // valores: [incn, cogs, mb, rb, ebitda, rn] × 4 años
  for (const serie of valores) base.push(...serie);
  if (over.ly !== undefined) base[4] = over.ly;
  if (over.estado !== undefined) base[5] = over.estado;
  if (over.emp !== undefined) base[6] = over.emp;
  return base;
};

const SERIES_3D = [
  [9495.55052, 7923.94692, 6424.35679, 5161.80481],
  [3130.74226, 2535.11986, 2115.97067, 1430.70304],
  [6364.80826, 5388.82706, 4308.38612, 3731.10177],
  [6761.69556, 5406.08515, 4321.79529, 3740.97717],
  [1481.13045, 1551.846749, 1313.82813, 820.819929],
  [101.12219, 306.53645, 256.50753, 84.76017],
];

describe("parsearFila (SABI)", () => {
  const cols = mapearColumnas(CABECERA);

  it("ancla los años en «Ultimo año disponible» y pasa miles a euros", () => {
    const r = parsearFila(fila({}, SERIES_3D), cols)!;
    expect(r.cif).toBe("B54722392");
    expect(r.estado).toBe("activa");
    expect(r.empleados).toBe(151);
    expect(r.anios.map((a) => a.anio)).toEqual([2025, 2024, 2023, 2022]);
    expect(r.anios[0]).toEqual({
      anio: 2025,
      ingresos: 9495551,
      margenBruto: 6761696, // Resultado bruto de SABI, no la columna MB
      ebitda: 1481130,
      resultadoNeto: 101122,
    });
  });

  it("descarta los años que SABI rellena con ceros", () => {
    const series = SERIES_3D.map((s) => [s[0], s[1], 0, 0]);
    const r = parsearFila(fila({ ly: "2021" }, series), cols)!;
    expect(r.anios.map((a) => a.anio)).toEqual([2021, 2020]);
  });

  it("sin último año no hay financieros; 0 empleados = sin dato", () => {
    const r = parsearFila(fila({ ly: null, estado: "0", emp: 0 }, SERIES_3D), cols)!;
    expect(r.estado).toBe("no_encontrada");
    expect(r.ultimoAnio).toBeNull();
    expect(r.anios).toEqual([]);
    expect(r.empleados).toBeNull();
  });

  it("falla si falta una columna", () => {
    expect(() => mapearColumnas(CABECERA.filter((h) => !h.startsWith("EBITDA")))).toThrow(/ebitda/);
  });
});

describe("estado de SABI", () => {
  it("traduce los literales de SABI", () => {
    expect(estadoDesdeSabi("Active (insolvency proceedings)")).toBe("concurso");
    expect(estadoDesdeSabi("Dissolved (merger or take-over)")).toBe("fusion");
    expect(estadoDesdeSabi("0")).toBe("no_encontrada");
    expect(estadoDesdeSabi(null)).toBe("no_encontrada");
  });

  it("para el import ante un literal desconocido", () => {
    expect(() => estadoDesdeSabi("Struck off")).toThrow(/desconocido/);
  });

  it("carga cifras de activas y en concurso, no del resto", () => {
    expect(cargaFinancieros("activa")).toBe(true);
    expect(cargaFinancieros("concurso")).toBe(true);
    expect(cargaFinancieros("disuelta")).toBe(false);
    expect(cargaFinancieros("no_encontrada")).toBe(false);
  });
});

describe("avisosFinancieros", () => {
  const hoy = 2026;

  it("activa con cuentas recientes: sin avisos", () => {
    expect(avisosFinancieros({ estado: "activa", ultimoAnio: 2024, anioActual: hoy })).toEqual([]);
  });

  it("estado aún no consultado (null) no avisa del estado", () => {
    expect(avisosFinancieros({ estado: null, ultimoAnio: 2025, anioActual: hoy })).toEqual([]);
  });

  it("sin financieros", () => {
    expect(avisosFinancieros({ estado: "activa", ultimoAnio: null, anioActual: hoy })).toEqual([
      { nivel: "info", texto: "No hay información financiera disponible" },
    ]);
  });

  it("disuelta con histórico antiguo: estado + cuentas antiguas", () => {
    expect(avisosFinancieros({ estado: "disuelta", ultimoAnio: 2021, anioActual: hoy })).toEqual([
      { nivel: "alerta", texto: "Disuelta" },
      { nivel: "info", texto: "Últimas cuentas disponibles: 2021" },
    ]);
  });

  it("no encontrada y sin datos", () => {
    expect(avisosFinancieros({ estado: "no_encontrada", ultimoAnio: null, anioActual: hoy })).toEqual([
      { nivel: "alerta", texto: "No encontrada en SABI" },
      { nivel: "info", texto: "No hay información financiera disponible" },
    ]);
  });
});
