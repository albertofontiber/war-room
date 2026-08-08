/**
 * Categorías del RIPCI (Reglamento de Instalaciones de Protección Contra
 * Incendios, RD 513/2017).
 *
 * Una empresa se habilita por categorías y por sección: puede instalar unas
 * cosas y mantener otras. **Mantenimiento tiene una categoría más que
 * instalación** —Extintores de incendios—, porque el mantenimiento de
 * extintores es una habilitación en sí misma y su instalación no.
 *
 * En la base se guardan las etiquetas completas, no los códigos, dentro de
 * `Empresa.ripci`: `{ "instalacion": [...], "mantenimiento": [...] }`.
 *
 * Fuente: Registro Integrado Industrial, división B, habilitación (C).
 */

export type SeccionRipci = "instalacion" | "mantenimiento";

/** Las 13 comunes a instalación y mantenimiento, en el orden del registro. */
export const CATEGORIAS_RIPCI = [
  "Detección y alarma de incendios",
  "Abastecimiento de agua",
  "Hidrantes exteriores",
  "Bocas de incendio equipadas",
  "Columna seca",
  "Rociadores automáticos y agua pulverizada",
  "Agua nebulizada",
  "Espuma física",
  "Extinción por polvo",
  "Agentes extintores gaseosos",
  "Aerosoles condensados",
  "Control de humos y de calor",
  "Señalización luminiscente",
] as const;

/** Solo existe como habilitación de mantenimiento. */
export const CATEGORIA_SOLO_MANTENIMIENTO = "Extintores de incendios";

/** Todas las categorías posibles, para pintar el filtro. */
export const TODAS_CATEGORIAS: readonly string[] = [
  ...CATEGORIAS_RIPCI,
  CATEGORIA_SOLO_MANTENIMIENTO,
];

export const SECCION_LABEL: Record<SeccionRipci, string> = {
  instalacion: "Instalación",
  mantenimiento: "Mantenimiento",
};

/**
 * Código de categoría -> etiqueta.
 *
 * El código sale del propio número de registro (`09-B-DC5-00704777`: la
 * tercera pieza es sección + habilitación + categoría), que es más fiable que
 * el texto de la tabla.
 */
export const CATEGORIA_POR_CODIGO: Record<string, string> = {
  "0": "Detección y alarma de incendios",
  "1": "Abastecimiento de agua",
  "2": "Hidrantes exteriores",
  "3": "Bocas de incendio equipadas",
  "4": "Columna seca",
  "5": "Rociadores automáticos y agua pulverizada",
  "6": "Agua nebulizada",
  "7": "Espuma física",
  "8": "Extinción por polvo",
  "9": "Agentes extintores gaseosos",
  A: "Aerosoles condensados",
  B: "Control de humos y de calor",
  C: CATEGORIA_SOLO_MANTENIMIENTO,
  D: "Señalización luminiscente",
};

const VALIDAS = new Set<string>(TODAS_CATEGORIAS);

export interface Ripci {
  instalacion: string[];
  mantenimiento: string[];
}

/**
 * Lee `Empresa.ripci`, descartando lo que no cuadre con el catálogo (una
 * categoría retirada en una revisión futura del reglamento, por ejemplo).
 */
export function parseRipci(valor: unknown): Ripci | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;

  const bruto = valor as Record<string, unknown>;
  const lista = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && VALIDAS.has(x)) : [];

  const ripci: Ripci = {
    instalacion: lista(bruto.instalacion),
    mantenimiento: lista(bruto.mantenimiento),
  };
  if (!ripci.instalacion.length && !ripci.mantenimiento.length) return null;

  // Se devuelven en el orden del catálogo, no en el que vengan.
  const ordena = (xs: string[]) => TODAS_CATEGORIAS.filter((c) => xs.includes(c));
  return { instalacion: ordena(ripci.instalacion), mantenimiento: ordena(ripci.mantenimiento) };
}

/**
 * ¿Cumple la empresa el filtro de categorías?
 *
 * Se exigen TODAS las marcadas, igual que en el filtro de habilitaciones: son
 * atributos acumulables y marcar varias sirve para acotar.
 *
 * @param seccion Si se indica, la categoría debe estar en esa sección; si no,
 *   vale que esté en cualquiera de las dos.
 */
export function cumpleFiltroRipci(
  ripci: Ripci | null,
  categorias: readonly string[],
  seccion: SeccionRipci | null
): boolean {
  if (!categorias.length) return true;
  if (!ripci) return false;

  const donde = seccion
    ? ripci[seccion]
    : [...ripci.instalacion, ...ripci.mantenimiento];

  return categorias.every((c) => donde.includes(c));
}
