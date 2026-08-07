/**
 * Habilitaciones del Registro Nacional de Seguridad Privada.
 *
 * La Policía Nacional publica un listado de empresas inscritas donde cada una
 * lleva ocho columnas, una por tipo de habilitación, con tres valores
 * posibles: E (estatal), A (autonómico) o N (sin actividad).
 *
 * El ámbito es POR HABILITACIÓN, no por empresa: hay empresas que instalan con
 * licencia autonómica pero tienen la central de alarmas con licencia estatal.
 *
 * Fuente: https://www.policia.es/miscelanea/seguridad_privada/sector/
 */

export type AmbitoHabilitacion = "E" | "A";

export interface Habilitacion {
  /** Código de la columna en el listado. */
  codigo: string;
  etiqueta: string;
  /** Descripción para el tooltip y el esquema que ve el chat. */
  descripcion: string;
}

export const HABILITACIONES: readonly Habilitacion[] = [
  { codigo: "VJ", etiqueta: "Vigilancia y seguridad", descripcion: "Vigilantes de seguridad y su especialidad de vigilante de explosivos" },
  { codigo: "PP", etiqueta: "Protección de personas", descripcion: "Escoltas privados" },
  { codigo: "INS", etiqueta: "Instalación y mantenimiento", descripcion: "Instalación y mantenimiento de aparatos, dispositivos y sistemas de seguridad" },
  { codigo: "DF", etiqueta: "Depósito de fondos", descripcion: "Depósito y custodia de efectivo, valores u objetos preciosos" },
  { codigo: "TF", etiqueta: "Transporte de fondos", descripcion: "Transporte y distribución de efectivo, valores u objetos preciosos" },
  { codigo: "CA", etiqueta: "Central receptora de alarmas", descripcion: "Explotación de centrales para la conexión, recepción, verificación y transmisión de señales de alarma" },
  { codigo: "DE", etiqueta: "Depósito de explosivos", descripcion: "Depósito y custodia de explosivos" },
  { codigo: "TE", etiqueta: "Transporte de objetos valiosos", descripcion: "Transporte y distribución de objetos valiosos o peligrosos" },
] as const;

export const ETIQUETA_HABILITACION: Record<string, string> = Object.fromEntries(
  HABILITACIONES.map((h) => [h.codigo, h.etiqueta])
);

const CODIGOS = new Set(HABILITACIONES.map((h) => h.codigo));

export function esHabilitacionValida(codigo: string): boolean {
  return CODIGOS.has(codigo);
}

export const AMBITO_LABEL: Record<AmbitoHabilitacion, string> = {
  E: "estatal",
  A: "autonómico",
};

/** Mapa habilitación → ámbito. Solo lleva las que la empresa tiene concedidas. */
export type MapaHabilitaciones = Partial<Record<string, AmbitoHabilitacion>>;

/**
 * Lee el JSON guardado en `Empresa.habilitaciones`, descartando lo que no
 * cuadre con el catálogo (una columna retirada en una edición futura, por
 * ejemplo).
 */
export function parseHabilitaciones(valor: unknown): MapaHabilitaciones {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};

  const out: MapaHabilitaciones = {};
  for (const [codigo, ambito] of Object.entries(valor as Record<string, unknown>)) {
    if (!esHabilitacionValida(codigo)) continue;
    if (ambito === "E" || ambito === "A") out[codigo] = ambito;
  }
  return out;
}

/** Habilitaciones concedidas, en el orden del catálogo. */
export function listaHabilitaciones(
  mapa: MapaHabilitaciones
): { habilitacion: Habilitacion; ambito: AmbitoHabilitacion }[] {
  return HABILITACIONES.filter((h) => mapa[h.codigo]).map((h) => ({
    habilitacion: h,
    ambito: mapa[h.codigo]!,
  }));
}
