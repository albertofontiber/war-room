// ─── Dominio ──────────────────────────────────────────────────────────────

export type Sector = "PCI" | "seguridad_electronica" | "mixto";
export type DealStage =
  | "identificado"
  | "contactado"
  | "primera_reunion"
  | "analisis"
  | "LOI enviada"
  | "execution"
  | "portfolio"
  | "on_hold"
  | "muerto";
export type TareaTipo =
  | "contacto_linkedin"
  | "mensaje_whatsapp"
  | "llamada"
  | "videollamada"
  | "reunion_presencial"
  | "otra";
export type TipoActo =
  | "adquisicion"
  | "disolucion"
  | "cambio_titular"
  | "fusion"
  | "otros";
export type TipoActividad = "nota" | "llamada" | "email" | "reunion";
export type Tendencia = "up" | "flat" | "down";
export type SizeMetric = "ingresos" | "ebitda";
export type Vista = "mapa" | "tabla" | "operaciones" | "grupos";

// ─── Financiero enriquecido (API response) ────────────────────────────────

export interface FinancieroEnriquecido {
  anio: number;
  ingresos: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null; // calculado: margenBruto/ingresos*100
  ebitda: number | null;
  ebitdaPct: number | null;      // calculado: ebitda/ingresos*100
  resultadoNeto: number | null;
}

export interface TendenciaIngresos {
  direccion: Tendencia;
  variacionPct: number | null;
}

// ─── Empresa completa (response de /api/empresas/[id]) ────────────────────

export interface EmpresaDetalle {
  id: number;
  cif: string;
  nombre: string;
  direccion: string | null;
  localidad: string | null;
  provincia: string;
  ccaa: string;
  lat: number | null;
  lng: number | null;
  sector: Sector;
  servicios: string[];
  empleados: number | null;
  web: string | null;
  linkedin: string | null;
  logoUrl: string | null;
  descripcion: string | null;
  cepreven: string | null;  // null | "asociada" | "calificada"
  aerme: boolean;
  enPerimetro: boolean;
  enPerimetroAt: string | null;
  scoreInicial: number | null;
  score: number | null;
  updatedAt: string;
  grupo: { id: number; nombre: string; tipo: string } | null;
  financieros: FinancieroEnriquecido[];
  tendenciaIngresos: TendenciaIngresos | null;
  tendenciaMargenBruto: TendenciaIngresos | null;
  crmEstado: {
    dealStage: DealStage | null;
    owner: string | null;
    ownerUserId: string | null;
    ownerUser: { id: string; name: string } | null;
    pipedriveOrgId: string | null;
    fechaEntradaStage: string | null;
    updatedAt: string;
  } | null;
  finderSource: { id: string; name: string; email: string } | null;
  stageDurations?: Partial<Record<DealStage, number>>;
  bormeAlertas: {
    id: number;
    fecha: string;
    tipoActo: string;
    grupoInferido: { nombre: string } | null;
    descripcion: string | null;
    urlBorme: string | null;
    leido: boolean;
  }[];
  actividades: {
    id: number;
    tipo: TipoActividad;
    texto: string | null;
    autor: string | null;
    fecha: string;
  }[];
}

// ─── Empresa en listado / GeoJSON (response de /api/empresas) ─────────────

export interface EmpresaResumen {
  id: number;
  nombre: string;
  provincia: string;
  ccaa: string;
  sector: Sector;
  lat: number | null;
  lng: number | null;
  empleados: number | null;
  web: string | null;
  logoUrl: string | null;
  cepreven: string | null;  // null | "asociada" | "calificada"
  aerme: boolean;
  enPerimetro: boolean;
  score: number | null;
  grupo: { id: number; nombre: string } | null;
  // últimos financieros (año más reciente)
  ingresos: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  tendenciaIngresos: TendenciaIngresos | null;
  crmEstado: { dealStage: DealStage | null; pipedriveOrgId: string | null } | null;
  bormeAlertasCount: number;
}

// ─── Filtros Zustand ──────────────────────────────────────────────────────

export interface FiltrosActivos {
  ccaa: string[];
  provincia: string[];
  sector: Sector[];
  grupoId: number[];
  crmStage: DealStage[];
  ingresosMin: number;
  ingresosMax: number;
  margenBrutoMin: number;
  margenBrutoMax: number;
  ebitdaMin: number;
  ebitdaMax: number;
  empleadosMin: number;
  empleadosMax: number;
  servicios: string[];
  enPerimetro: boolean | null; // null = todos, true = solo en perímetro, false = solo fuera
  cepreven: boolean | null;
  aerme: boolean | null;
}

export const FILTROS_DEFAULT: FiltrosActivos = {
  ccaa: [],
  provincia: [],
  sector: [],
  grupoId: [],
  crmStage: [],
  ingresosMin: 0,
  ingresosMax: Infinity,   // sin límite superior — slider al máximo = sin filtro
  margenBrutoMin: 0,
  margenBrutoMax: 100,     // 0–100% es el rango natural; 100 = sin filtro
  ebitdaMin: 0,
  ebitdaMax: Infinity,  // 0–50% display; Infinity = sin límite superior
  empleadosMin: 0,
  empleadosMax: Infinity,
  servicios: [],
  enPerimetro: null,       // null = todos (sin filtro por perímetro)
  cepreven: null,
  aerme: null,
};
