/**
 * Tipos compartidos por los sub-componentes y hooks de la vista
 * `OperacionesBorme`. Extraídos del archivo monolítico original para que
 * cada módulo tipa solo lo que necesita.
 */

export type SubVista = "senales" | "alertas_personas" | "actividad";

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

// Actividad reciente (todos los tipos)
export interface RecienteItem {
  id: number;
  fecha: string;
  tipoActo: string;
  descripcion: string | null;
  urlBorme: string | null;
  grupoNombre: string | null;
  empresa: {
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
    anioFinanciero: number | null;
  };
}

/** Tipos del filtro pill superior para sub-vista "senales". */
export const FILTER_TIPOS = [
  "fusion",
  "adquisicion",
  "posible_adquisicion",
  "nombramiento",
  "cambio_denominacion",
] as const;

export type FilterTipo = (typeof FILTER_TIPOS)[number];

export type SortDir = "asc" | "desc";
