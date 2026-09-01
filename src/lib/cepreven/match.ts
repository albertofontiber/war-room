/**
 * Cruce entre los listados de Cepreven y las empresas del War Room.
 *
 * Cepreven publica razones sociales sueltas, sin CIF, y no siempre coinciden
 * con las de la base: unas veces es la marca comercial ("CV Instalaciones"
 * frente a "Calidad y Verificación en Instalaciones, S.A."), otras el nombre
 * del titular ("Manuela Conejero, Riesgo Cero en Incendios" frente a
 * "Instalaciones Contra Incendios Conejero"). El cruce va por capas:
 *
 *   1. ALIAS explícito por CIF, para los casos que ningún algoritmo acierta.
 *   2. Nombre normalizado exacto (mayúsculas, sin acentos ni puntuación,
 *      sin forma jurídica).
 *
 * Deliberadamente NO hay una capa difusa que case por parecido: un falso
 * positivo aquí marca como calificada a una empresa que no lo está, y eso
 * es peor que dejarla sin marcar y revisarla a mano. Lo que no casa se
 * reporta para decidirlo una vez y, si procede, se añade a ALIAS.
 */

/**
 * Razón social del listado de Cepreven -> CIF en la base.
 *
 * Cada entrada es una decisión tomada a mano, no una heurística. Las cuatro
 * primeras las confirmó Alberto una por una (2026-08-06); "PCI Clima" es el
 * ejemplo de por qué esto no se puede automatizar: en la base hay además una
 * "PCI CLIMA MANTENIMIENTOS, S.L." que es una empresa distinta.
 */
export const ALIAS: Record<string, string> = {
  // Confirmados por Alberto uno a uno (2026-08-06).
  "CV INSTALACIONES": "A45407525", // Calidad y Verificación en Instalaciones, S.A.
  "PCI CLIMA": "B84886910", // Protección Contra Incendios Clima, S.L.
  "PROSEGUR ESPANA": "B87222014", // Prosegur Soluciones Integrales de Seguridad España
  "MANUELA CONEJERO RIESGO CERO EN INCENDIOS": "B54143250", // Instalaciones Contra Incendios Conejero

  // Marca comercial frente a razón social.
  "GRUPO EUROFESA": "A78360955", // Eurofesa, S.A.
  PACISA: "B87317228", // Pacisa Fire Service, S.L.
  COTTES: "B12849212", // el PDF la llama "COTTES Fire & Smoke Solutions"
  "COTTES FIRE SMOKE SOLUTIONS": "B12849212",
  ENGIE: "A87211827", // Engie Servicios Energéticos, S.A.
  "ARCE CLIMA": "B15814296", // Arce Clima Sistemas y Aplicaciones, S.L.
  "NTCI NUEVAS TECNOLOGIAS CONTRA INCENDIOS": "B45630126", // Nuevas Tecnologías Contra Incendios
  TESEIN: "B84385657", // en la base figura como "Teseín 388, S.L."

  // Diferencias de grafía que no son de forma jurídica.
  AIRFEU: "B96659438", // el PDF la lista dos veces, "AIR FEU" y "AIRFEU"
  // Cepreven la escribe pegada y la base con espacio ("EXTI NORTE, S.L.").
  // Es la misma: Errenteria está en Gipuzkoa, igual que la ficha.
  EXTINORTE: "B20646717",
  "FUEGO DIEZ": "B98250319", // en la base, "Fuegodiez"
  "FIRE CONTROL PROTECT SYSTEMS": "B74393307", // en la base, "System" en singular
  "BIFAN IBERICA DE SEGURIDAD": "B73770521", // en la base, sin el "de"
  // La razón social guardada arrastra un "&amp;" sin decodificar.
  "INGENIERIA PROYECTOS CONSULTING LANZA": "B33956384",

  // Listado de asociadas: la grafía de la web no coincide con la de la base.
  // Sin estos alias el cruce las daría por salidas de la asociación.
  "AIRSEXT SERVICIOS CONTRA INCENDIOS REGIONALES": "B21531959", // la base abrevia "C.I."
  "HISPANIA PROTECCION Y SEGURIDAD": "B70229638", // la base tiene "PPROTECCIÓN"
  "TECNITEX FIRE SYSTEMS": "B86091014", // la base tiene "SYSTEM" en singular
  "TYCO BUILDING SERVICES PRODUCTS": "W0031406B", // la base añade "BV Sucursal en España"
};

/** Formas jurídicas que se recortan del final para poder comparar nombres. */
// "S COOP" va antes que las abreviaturas de una sola pieza porque el pegado de
// letras sueltas no lo une (COOP no es una letra suelta).
const FORMA_JURIDICA =
  / (S COOP|SCOOP|SLU|SLL|SLP|SAU|SAL|SCP|SL|SA|SC|CB|SOCIEDAD LIMITADA|SOCIEDAD ANONIMA|UNIPERSONAL)+$/;

/**
 * Normaliza una razón social para poder compararla.
 *
 * Quita acentos, puntuación y forma jurídica, que es donde están casi todas
 * las discrepancias de grafía entre las dos fuentes ("SURIS SL" / "SURIS,
 * S.L." / "Suris, S.L.").
 */
export function normalizaNombre(nombre: string): string {
  let n = nombre
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // "S.L." se ha convertido en "S L": se vuelven a pegar las letras sueltas
    // para que el recorte de forma jurídica las vea como un solo token. Sin
    // esto "AIR FEU, S.L." y "AIR FEU SL" no casan.
    .replace(/\b([A-Z]) (?=[A-Z]\b)/g, "$1");

  // Se aplica en bucle porque hay nombres con dos sufijos ("… S.L. UNIPERSONAL").
  let previo: string;
  do {
    previo = n;
    n = n.replace(FORMA_JURIDICA, "").trim();
  } while (n !== previo);

  return n;
}

export interface EmpresaBase {
  id: number;
  cif: string | null;
  nombre: string;
}

export interface Casado<T> {
  origen: T;
  empresa: EmpresaBase;
  via: "alias" | "nombre";
}

export interface ResultadoCruce<T> {
  casados: Casado<T>[];
  /** Entradas del listado que no corresponden a ninguna empresa de la base. */
  sinCasar: T[];
}

/**
 * Cruza entradas de un listado de Cepreven contra las empresas de la base.
 *
 * @param entradas Filas del listado, cada una con su razón social.
 * @param empresas Universo de empresas de la base.
 * @param nombreDe Cómo obtener la razón social de cada entrada.
 */
export function cruza<T>(
  entradas: readonly T[],
  empresas: readonly EmpresaBase[],
  nombreDe: (entrada: T) => string
): ResultadoCruce<T> {
  const porCif = new Map<string, EmpresaBase>();
  const porNombre = new Map<string, EmpresaBase[]>();

  for (const e of empresas) {
    if (e.cif) porCif.set(e.cif.toUpperCase(), e);
    const clave = normalizaNombre(e.nombre);
    porNombre.set(clave, [...(porNombre.get(clave) ?? []), e]);
  }

  const casados: Casado<T>[] = [];
  const sinCasar: T[] = [];

  for (const entrada of entradas) {
    const clave = normalizaNombre(nombreDe(entrada));

    const cifAlias = ALIAS[clave];
    if (cifAlias) {
      const empresa = porCif.get(cifAlias);
      if (empresa) {
        casados.push({ origen: entrada, empresa, via: "alias" });
        continue;
      }
    }

    const candidatos = porNombre.get(clave) ?? [];
    // Un nombre normalizado ambiguo (dos empresas distintas con la misma
    // grafía) se deja sin casar a propósito: hay que mirarlo a mano.
    if (candidatos.length === 1) {
      casados.push({ origen: entrada, empresa: candidatos[0], via: "nombre" });
      continue;
    }

    sinCasar.push(entrada);
  }

  return { casados, sinCasar };
}
