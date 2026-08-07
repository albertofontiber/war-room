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
// Tipos para Tarea (modelo unificado tras la fusión Tarea+Actividad).
// "email" se incorporó del antiguo modelo Actividad. Una "actividad histórica"
// es ahora una Tarea con completada=true + resultado != null.
export type TareaTipo =
  | "contacto_linkedin"
  | "mensaje_whatsapp"
  | "llamada"
  | "videollamada"
  | "reunion_presencial"
  | "email"
  | "otra";
export type TipoActo =
  | "adquisicion"
  | "disolucion"
  | "cambio_titular"
  | "fusion"
  | "otros";
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
  ceprevenAreas: string[];  // códigos de área; vacío salvo si cepreven = "calificada"
  aerme: boolean;
  ambitoGeo: string | null; // "E" | "A" — ámbito de la habilitación de instalación
  habilitaciones: unknown;  // { "INS": "A", "CA": "E" … } del Registro de Seguridad Privada
  enPerimetro: boolean;
  enPerimetroAt: string | null;
  esAnonima: boolean;
  // Documentación externa (OneDrive + Notion)
  oneDriveUrl: string | null;
  notionUrl: string | null;
  nombreComercial: string | null;
  scoreInicial: number | null;
  score: number | null;
  updatedAt: string;
  grupo: { id: number; nombre: string; tipo: string } | null;
  financieros: FinancieroEnriquecido[];
  tendenciaIngresos: TendenciaIngresos | null;
  tendenciaMargenBruto: TendenciaIngresos | null;
  crmEstado: {
    dealStage: DealStage | null;
    ownerUserId: string | null;
    ownerUser: { id: string; name: string } | null;
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
  // Última Tarea completada — alimenta el stat "Última actividad" de PanelEmpresa.
  ultimaActividad: { fecha: string; tipo: string } | null;
  tareasPendientesCount: number;
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
  anioFinanciero: number | null;
  ingresos: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  tendenciaIngresos: TendenciaIngresos | null;
  crmEstado: { dealStage: DealStage | null } | null;
  bormeAlertasCount: number;
}

// ─── Filtros Zustand ──────────────────────────────────────────────────────

export interface FiltrosActivos {
  ccaa: string[];
  provincia: string[];
  sector: Sector[];
  grupoId: number[];
  // DealStage real ("identificado", "contactado", ...) + sentinel "sin_crm"
  // para filtrar empresas sin CrmEstado o con dealStage=null.
  crmStage: (DealStage | "sin_crm")[];
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
  // "calificada" es rango superior a "asociada". "cualquiera" = tiene alguna
  // de las dos; "ninguna" = no consta en Cepreven; null = sin filtrar.
  cepreven: "calificada" | "asociada" | "cualquiera" | "ninguna" | null;
  aerme: boolean | null;
  // Códigos del Registro de Seguridad Privada ("INS", "CA"…). Se exigen TODAS
  // las seleccionadas: son atributos acumulables, y al marcar varias lo que se
  // busca es acotar ("con central de alarmas Y vigilancia"), no ampliar.
  habilitaciones: string[];
  // Ámbito exigido a esas habilitaciones. null = da igual estatal o autonómico.
  habilitacionAmbito: "E" | "A" | null;
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
  habilitaciones: [],
  habilitacionAmbito: null,
};
