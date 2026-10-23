/**
 * Lectura de la extracción de SABI/Informa ("2610 Financials SABI.xlsx").
 *
 * Formato: una fila por CIF; los años van en columnas relativas
 * ("… Últ. año disp.", "… Año - 1" … "Año - 3") ancladas en
 * «Ultimo año disponible». Importes en miles de EUR.
 *
 * Trampas medidas en la extracción de oct 2026:
 *  - SABI rellena con 0 los años que no tiene (1.110 años con todo a 0):
 *    un año con todas las cifras a 0 es "sin dato", no un año a cero.
 *  - Trae una columna extra «MB» (= cifra de negocios − aprovisionamientos)
 *    que NO usamos: margenBruto = «Resultado bruto» de SABI, la misma
 *    definición que el histórico.
 */

import { estadoDesdeSabi, type EstadoEmpresa } from "./empresa-estado";

export interface AnioSabi {
  anio: number;
  ingresos: number | null; // € — Importe neto de la cifra de negocios
  margenBruto: number | null; // € — Resultado bruto de SABI
  ebitda: number | null; // €
  resultadoNeto: number | null; // € — Resultado del ejercicio
}

export interface FilaSabi {
  cif: string;
  estado: EstadoEmpresa;
  ultimoAnio: number | null;
  empleados: number | null;
  anios: AnioSabi[];
}

const METRICAS = {
  ingresos: ["importe neto", "cifra de ventas"],
  margenBruto: ["resultado bruto"],
  ebitda: ["ebitda"],
  resultadoNeto: ["resultado del ejercicio"],
} as const;

type Metrica = keyof typeof METRICAS;

export interface ColumnasSabi {
  cif: number;
  ultimoAnio: number;
  estado: number;
  empleados: number;
  /** metrica → [col Últ. año, col Año-1, col Año-2, col Año-3] */
  metricas: Record<Metrica, number[]>;
}

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Desfase del año de una cabecera: 0 = último disponible, n = "Año - n". */
function desfase(h: string): number | null {
  if (h.includes("ult. ano disp") || h.includes("ult ano disp")) return 0;
  const m = /ano - (\d)/.exec(h);
  return m ? Number(m[1]) : null;
}

/** Localiza las columnas a partir de la fila de cabeceras. */
export function mapearColumnas(cabecera: unknown[]): ColumnasSabi {
  const hs = cabecera.map(norm);
  const buscar = (pred: (h: string) => boolean, nombre: string) => {
    const i = hs.findIndex(pred);
    if (i === -1) throw new Error(`Falta la columna «${nombre}» en la cabecera`);
    return i;
  };

  const metricas = {} as Record<Metrica, number[]>;
  for (const [m, terms] of Object.entries(METRICAS) as [Metrica, readonly string[]][]) {
    const cols: number[] = [];
    hs.forEach((h, i) => {
      if (!terms.every((t) => h.includes(t))) return;
      const d = desfase(h);
      if (d !== null) cols[d] = i;
    });
    for (let d = 0; d < 4; d++) {
      if (cols[d] === undefined) throw new Error(`Falta la columna de ${m} con desfase ${d}`);
    }
    metricas[m] = cols;
  }

  return {
    cif: buscar((h) => h === "cif", "CIF"),
    ultimoAnio: buscar((h) => h.startsWith("ultimo ano disponible"), "Ultimo año disponible"),
    estado: buscar((h) => h === "estado", "Estado"),
    empleados: buscar((h) => h.startsWith("numero empleados"), "Número empleados"),
    metricas,
  };
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Miles de EUR → EUR enteros. */
function eur(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.round(n * 1000);
}

export function parsearFila(fila: unknown[], cols: ColumnasSabi): FilaSabi | null {
  const cif = String(fila[cols.cif] ?? "").trim().toUpperCase();
  if (!cif) return null;

  const estado = estadoDesdeSabi(fila[cols.estado]);
  const ly = numero(fila[cols.ultimoAnio]);
  const ultimoAnio = ly !== null && ly > 1900 ? Math.trunc(ly) : null;

  const emp = numero(fila[cols.empleados]);
  const empleados = emp !== null && emp > 0 ? Math.round(emp) : null;

  const anios: AnioSabi[] = [];
  if (ultimoAnio !== null) {
    for (let d = 0; d < 4; d++) {
      const a: AnioSabi = {
        anio: ultimoAnio - d,
        ingresos: eur(fila[cols.metricas.ingresos[d]]),
        margenBruto: eur(fila[cols.metricas.margenBruto[d]]),
        ebitda: eur(fila[cols.metricas.ebitda[d]]),
        resultadoNeto: eur(fila[cols.metricas.resultadoNeto[d]]),
      };
      const valores = [a.ingresos, a.margenBruto, a.ebitda, a.resultadoNeto];
      // Año relleno con ceros (o vacío) = SABI no tiene cuentas de ese año.
      if (valores.every((v) => v === null || v === 0)) continue;
      anios.push(a);
    }
  }

  return { cif, estado, ultimoAnio, empleados, anios };
}
