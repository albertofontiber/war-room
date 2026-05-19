/**
 * Tipos compartidos por los sub-componentes y hooks de la vista
 * `OperacionesBorme`. Extraídos del archivo monolítico original para que
 * cada módulo tipa solo lo que necesita.
 */

export type SubVista = "senales" | "alertas_personas";

export interface Adquirente {
  tipo: "grupo_conocido" | "empresa_extraida" | "desconocido";
  grupoId?: number;
  grupoNombre?: string;
  empresaNombre?: string;
  personaDetectada?: string | null;
}

export interface EmpresaOp {
  id: number;
  nombre: string;
  cif: string;
  web: string | null;
  grupoId: number | null;
  enPerimetro: boolean;
  ccaa: string | null;
  provincia: string | null;
  sector: string | null;
  ingresos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  anioFinanciero: number | null;
}

export interface OperacionItem {
  id: number;
  fecha: string;
  tipoActo: string;
  efectiveTipo: string;
  descripcion: string | null;
  urlBorme: string | null;
  leido: boolean;
  empresa: EmpresaOp;
  adquirente: Adquirente;
}

export interface PersonaEnEmpresa {
  empresaId: number;
  empresaNombre: string;
  grupoNombre: string | null;
  grupoId: number | null;
  rol: string | null;
  ultimaFecha: string;
  urlBorme: string | null;
  enPerimetro: boolean;
  ccaa: string | null;
  provincia: string | null;
  sector: string | null;
  web: string | null;
  fuente: string;
  nombreOrig: string;
  ingresos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  anioFinanciero: number | null;
}

export interface PersonaCompartida {
  nombreNorm: string;
  displayName: string;
  numEmpresas: number;
  ultimaAparicion: string;
  empresas: PersonaEnEmpresa[];
}

/** Tipos del filtro pill superior. Los 5 primeros son señales M&A puras;
 *  los 2 últimos (disolución + otros) cubren el resto del BORME que antes
 *  vivía en la pestaña "Actividad reciente" (eliminada). Por defecto los 7
 *  están activos — el usuario los desactiva manualmente. */
export const FILTER_TIPOS = [
  "fusion",
  "adquisicion",
  "posible_adquisicion",
  "nombramiento",
  "cambio_denominacion",
  "disolucion",
  "otros",
] as const;

export type FilterTipo = (typeof FILTER_TIPOS)[number];

export type SortDir = "asc" | "desc";
