/**
 * Taxonomía de la Calificación Cepreven.
 *
 * Cepreven califica a las empresas por ÁREA (rociadores de riesgo ordinario,
 * detección, compartimentación…) dentro de tres FAMILIAS: instaladoras,
 * ingenierías y mantenedoras. Una misma empresa puede estar calificada en
 * varias áreas de varias familias.
 *
 * Los códigos son los que usa el propio listado (EAA-RO, DAI, PAS-COMP…),
 * prefijados con la familia cuando el mismo título aparece en más de una
 * (p.ej. "Sistemas de control de humos" es área de ingeniería y de
 * mantenimiento).
 *
 * Fuente: https://www.calificacioncepreven.com/Descarga-Documentos.html
 */

export type FamiliaCepreven = "instalador" | "ingenieria" | "mantenimiento";

export interface AreaCepreven {
  codigo: string;
  /** Etiqueta corta para el tooltip de la ficha. */
  etiqueta: string;
  familia: FamiliaCepreven;
  /** Título tal cual aparece en el PDF, normalizado (mayúsculas, sin dígitos). */
  tituloPdf: string;
}

export const AREAS_CEPREVEN: readonly AreaCepreven[] = [
  // ─── Instaladoras ────────────────────────────────────────────────────────
  { codigo: "DAI", etiqueta: "Detección automática de incendio", familia: "instalador", tituloPdf: "DETECCIÓN AUTOMÁTICA DE INCENDIO" },
  { codigo: "EAA-RO", etiqueta: "Rociadores riesgo ordinario", familia: "instalador", tituloPdf: "ROCIADORES RIESGO ORDINARIO" },
  { codigo: "EAA-RE", etiqueta: "Rociadores riesgo extra", familia: "instalador", tituloPdf: "ROCIADORES RIESGO EXTRA" },
  { codigo: "EAA-P", etiqueta: "Agua pulverizada", familia: "instalador", tituloPdf: "AGUA PULVERIZADA" },
  { codigo: "EAA-E", etiqueta: "Espuma", familia: "instalador", tituloPdf: "ESPUMA" },
  // El subíndice de CO₂ se pierde al extraer el texto del PDF: "CO2 ALTA
  // PRESIÓN" llega como "CO ALTA PRESIÓN". Los títulos van sin dígitos.
  { codigo: "EAG-A", etiqueta: "CO₂ alta presión", familia: "instalador", tituloPdf: "CO ALTA PRESIÓN" },
  { codigo: "EAG-B", etiqueta: "CO₂ baja presión", familia: "instalador", tituloPdf: "CO BAJA PRESIÓN" },
  { codigo: "EAG-IQ", etiqueta: "Gases inertes y químicos", familia: "instalador", tituloPdf: "GASES INERTES Y QUÍMICOS" },
  { codigo: "SCH-FB", etiqueta: "Humos: flotabilidad / barrido", familia: "instalador", tituloPdf: "FLOTABILIDAD / BARRIDO" },
  { codigo: "SCH-PD", etiqueta: "Humos: presurización diferencial", familia: "instalador", tituloPdf: "PRESURIZACIÓN DIFERENCIAL" },
  { codigo: "PAS-COMP", etiqueta: "Pasiva: compartimentación", familia: "instalador", tituloPdf: "LIMITACIÓN A LA PROPAGACIÓN" },
  { codigo: "PAS-REAC", etiqueta: "Pasiva: reacción al fuego", familia: "instalador", tituloPdf: "MEJORA DE REACCIÓN AL FUEGO" },
  { codigo: "PAS-ESTR", etiqueta: "Pasiva: protección de estructuras", familia: "instalador", tituloPdf: "PROTECCIÓN DE ESTRUCTURAS" },

  // ─── Ingenierías ─────────────────────────────────────────────────────────
  { codigo: "ING-AGUA", etiqueta: "Extinción por agua", familia: "ingenieria", tituloPdf: "SISTEMAS DE EXTINCIÓN POR AGUA" },
  { codigo: "ING-GAS", etiqueta: "Extinción por gas", familia: "ingenieria", tituloPdf: "SISTEMAS DE EXTINCIÓN POR GAS" },
  { codigo: "ING-DAI", etiqueta: "Detección automática", familia: "ingenieria", tituloPdf: "DETECCIÓN AUTOMÁTICA DE INCENDIOS" },
  { codigo: "ING-SCH", etiqueta: "Control de humos", familia: "ingenieria", tituloPdf: "SISTEMAS DE CONTROL DE HUMOS" },

  // ─── Mantenedoras ────────────────────────────────────────────────────────
  { codigo: "MANT-DAI", etiqueta: "Detección automática", familia: "mantenimiento", tituloPdf: "DETECCIÓN AUTOMÁTICA DE INCENDIOS" },
  { codigo: "MANT-EAA", etiqueta: "Extinción por agua", familia: "mantenimiento", tituloPdf: "SISTEMAS DE EXTINCIÓN POR AGUA" },
  { codigo: "MANT-EAG", etiqueta: "Extinción por gas", familia: "mantenimiento", tituloPdf: "SISTEMAS DE EXTINCIÓN POR GAS" },
  { codigo: "MANT-SCH", etiqueta: "Control de humos", familia: "mantenimiento", tituloPdf: "SISTEMAS DE CONTROL DE HUMOS" },
  { codigo: "MANT-EAP", etiqueta: "Extinción por polvo", familia: "mantenimiento", tituloPdf: "SISTEMAS DE EXTINCIÓN POR POLVO" },
  { codigo: "MANT-EAAer", etiqueta: "Extinción por aerosoles", familia: "mantenimiento", tituloPdf: "SISTEMAS DE EXTINCIÓN POR AEROSOLES" },
  { codigo: "MANT-MMP", etiqueta: "Medios manuales de PCI", familia: "mantenimiento", tituloPdf: "MEDIOS MANUALES DE PROTECCIÓN CONTRA INCENDIOS" },
] as const;

export const ETIQUETA_AREA: Record<string, string> = Object.fromEntries(
  AREAS_CEPREVEN.map((a) => [a.codigo, a.etiqueta])
);

export const FAMILIA_LABEL: Record<FamiliaCepreven, string> = {
  instalador: "Instalación",
  ingenieria: "Ingeniería",
  mantenimiento: "Mantenimiento",
};

/** Códigos válidos, para descartar basura al leer el JSON de la BD. */
const CODIGOS_VALIDOS = new Set(AREAS_CEPREVEN.map((a) => a.codigo));

export function esAreaValida(codigo: string): boolean {
  return CODIGOS_VALIDOS.has(codigo);
}

/**
 * Agrupa códigos de área por familia, en el orden de `AREAS_CEPREVEN`, para
 * pintarlos por bloques en el tooltip de la ficha.
 */
export function agruparPorFamilia(
  codigos: readonly string[]
): { familia: FamiliaCepreven; areas: AreaCepreven[] }[] {
  const pedidos = new Set(codigos);
  const porFamilia = new Map<FamiliaCepreven, AreaCepreven[]>();

  for (const area of AREAS_CEPREVEN) {
    if (!pedidos.has(area.codigo)) continue;
    const lista = porFamilia.get(area.familia) ?? [];
    lista.push(area);
    porFamilia.set(area.familia, lista);
  }

  return (["instalador", "ingenieria", "mantenimiento"] as const)
    .filter((f) => porFamilia.has(f))
    .map((familia) => ({ familia, areas: porFamilia.get(familia)! }));
}
