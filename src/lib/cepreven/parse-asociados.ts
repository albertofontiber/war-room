/**
 * Parser del listado de empresas ASOCIADAS a Cepreven.
 *
 * A diferencia de las calificadas (un PDF maquetado, ver `parse-listado.ts`),
 * las asociadas están en una página HTML estática y muy regular:
 *
 *   <div class="… miembro-normal">          (o miembro-premium)
 *     <a href="…/asociados/listado/SLUG">
 *       <div class="foto"><img src="…"></div>
 *       <div class="info">
 *         <div class="nombre">3F Ingeniería Mantenimiento, S.L.</div>
 *         <div class="poblacion">MADRID</div>
 *       </div>
 *     </a>
 *   </div>
 *
 * Se parsea con expresiones regulares en vez de con un DOM porque el marcado
 * es plano y predecible, y así no hay que añadir una dependencia nueva. Si
 * Cepreven rediseña la página el parser devolverá 0 empresas, y de eso avisa
 * el cron: es un fallo ruidoso, no silencioso.
 *
 * Fuente: https://www.cepreven.com/asociados/listado
 */

export const URL_ASOCIADOS = "https://www.cepreven.com/asociados/listado";

export interface EmpresaAsociada {
  nombre: string;
  /** "TORDERA - BARCELONA" tal cual figura en la web; puede venir vacío. */
  poblacion: string;
  /** Ficha en cepreven.com. */
  url: string;
  /**
   * Los "premium" no son empresas del sector, sino miembros institucionales
   * (asociaciones, patronales, una feria). Se marcan para poder excluirlos.
   */
  institucional: boolean;
}

const BLOQUE =
  /miembro-(normal|premium)"[\s\S]*?<a href="([^"]*)"[\s\S]*?<div class="nombre">([\s\S]*?)<\/div>[\s\S]*?<div class="poblacion">([\s\S]*?)<\/div>/g;

const ENTIDADES: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

/** Quita etiquetas, resuelve entidades y colapsa espacios. */
function limpia(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrae las empresas asociadas del HTML del listado.
 *
 * @param html Página completa, ya decodificada a texto.
 */
export function parseAsociados(html: string): EmpresaAsociada[] {
  const out: EmpresaAsociada[] = [];
  const vistos = new Set<string>();

  for (const [, tipo, url, nombre, poblacion] of html.matchAll(BLOQUE)) {
    const limpio = limpia(nombre);
    if (!limpio || vistos.has(limpio)) continue;
    vistos.add(limpio);
    out.push({
      nombre: limpio,
      poblacion: limpia(poblacion),
      url: limpia(url),
      institucional: tipo === "premium",
    });
  }

  return out;
}

/**
 * Descarga y parsea el listado de asociadas.
 *
 * La web declara `charset=UTF-8` y lo cumple, pero se decodifica de forma
 * explícita para que un cambio futuro de codificación falle aquí y no acabe
 * escribiendo nombres corruptos en la base.
 */
export async function fetchAsociados(url = URL_ASOCIADOS): Promise<EmpresaAsociada[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "war-room/1.0 (+contacto@fontiber.com)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);

  const html = new TextDecoder("utf-8", { fatal: false }).decode(
    await res.arrayBuffer()
  );
  return parseAsociados(html);
}
