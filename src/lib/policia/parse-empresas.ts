/**
 * Parser del "Listado de empresas inscritas" del Registro Nacional de
 * Seguridad Privada (Policía Nacional).
 *
 * A diferencia del PDF de Cepreven, este sí es una tabla de verdad, con 17
 * columnas y las mismas posiciones en las 102 páginas. El parser localiza esas
 * posiciones leyendo la fila de cabecera de cada página —en vez de fijarlas a
 * mano— y reparte cada fragmento de texto en la columna cuyo inicio le queda
 * más cerca por la izquierda.
 *
 * Dos particularidades del documento:
 *
 *   - Cada registro ocupa VARIAS líneas: la razón social, el domicilio y hasta
 *     el CIF se parten en trozos ("A2502274" en una línea y el dígito de
 *     control "0" en la siguiente). Un registro nuevo empieza cuando aparece
 *     algo en la columna NÚMERO.
 *   - El texto partido lleva guiones de maquetación ("SEGURIDAD AU-" +
 *     "DIOVISUALES"), que hay que coser sin dejar el guión.
 *
 * Fuente: https://www.policia.es/miscelanea/seguridad_privada/sector/
 */

import type { AmbitoHabilitacion, MapaHabilitaciones } from "./habilitaciones";
import { HABILITACIONES } from "./habilitaciones";

/** Columnas de la tabla, por el rótulo con el que salen en la cabecera. */
const COLUMNAS = [
  "NUMERO",
  "FECHA",
  "EMPRESA",
  "CIF",
  "DOMICILIO",
  "LOCALIDAD",
  "PROVINCIA",
  "AUTONOMIA",
  ...HABILITACIONES.map((h) => h.codigo),
  "EMAIL",
] as const;

type Columna = (typeof COLUMNAS)[number];

/**
 * Límite izquierdo de cada columna, en puntos.
 *
 * No se deducen de la cabecera porque los rótulos NO están alineados con sus
 * datos: el rótulo "CIF" cae en x=242 pero los CIF empiezan en 228, y
 * "EMPRESA" está en 163 mientras las razones sociales arrancan en 136. Tomar
 * la posición del rótulo repartiría media tabla en la columna equivocada.
 *
 * Son las separaciones reales de la tabla, medidas sobre la edición de
 * 01/02/2026. `validaCabecera` comprueba en cada página que los rótulos siguen
 * cayendo donde deben; si reeditan el documento con otro ancho de columnas la
 * validación falla, la página se descarta y el resultado es 0 empresas —
 * un fallo ruidoso, no una tabla mal repartida en silencio.
 */
const LIMITES: readonly [Columna, number][] = [
  ["NUMERO", 0],
  ["FECHA", 95],
  ["EMPRESA", 133],
  ["CIF", 226],
  ["DOMICILIO", 266],
  ["LOCALIDAD", 348],
  ["PROVINCIA", 400],
  ["AUTONOMIA", 450],
  ["VJ", 500],
  ["PP", 513],
  ["INS", 527],
  ["DF", 548],
  ["TF", 562],
  ["CA", 576],
  ["DE", 590],
  ["TE", 604],
  ["EMAIL", 620],
];

/** Rótulo de cabecera de cada columna, para validar el reparto. */
const ROTULOS: Partial<Record<Columna, string>> = {
  FECHA: "FECHA",
  EMPRESA: "EMPRESA",
  CIF: "CIF",
  DOMICILIO: "DOMICILIO",
  LOCALIDAD: "LOCALIDAD",
  PROVINCIA: "PROVINCIA",
  AUTONOMIA: "AUTONOMIA",
  VJ: "VJ",
  PP: "PP",
  INS: "INS",
  DF: "DF",
  TF: "TF",
  CA: "CA",
  DE: "DE",
  TE: "TE",
  EMAIL: "COR ELECTRO",
};

/** Dos fragmentos son de la misma línea si su `y` difiere en menos. */
const TOLERANCIA_LINEA = 3;

export interface FragmentoPdf {
  texto: string;
  x: number;
  y: number;
}

export interface EmpresaInscrita {
  /** Número de inscripción en el registro. */
  numero: string;
  nombre: string;
  cif: string;
  domicilio: string;
  localidad: string;
  provincia: string;
  ccaa: string;
  habilitaciones: MapaHabilitaciones;
  email: string;
}

type Fila = Partial<Record<Columna, string>>;

/**
 * Une trozos cosiendo los guiones de maquetación.
 *
 * El guión de partición llega como fragmento suelto ("TRANSPORTES BLIN" + "-"
 * + "DADOS"), así que al quitarlo hay que arrastrar también el espacio que
 * quedó delante: si no, sale "TRANSPORTES BLIN DADOS".
 */
function cose(partes: readonly string[]): string {
  let out = "";
  for (const parte of partes) {
    const trozo = parte.trim();
    if (!trozo) continue;
    if (out.endsWith("-")) out = out.slice(0, -1).trimEnd() + trozo;
    else out = out ? `${out} ${trozo}` : trozo;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** En qué columna cae un fragmento, según su posición horizontal. */
function columnaDe(x: number): Columna {
  let columna: Columna = LIMITES[0][0];
  for (const [c, limite] of LIMITES) {
    if (x >= limite) columna = c;
    else break;
  }
  return columna;
}

/**
 * Comprueba que la tabla sigue teniendo el reparto de columnas esperado.
 *
 * Busca la fila de cabecera y verifica que cada rótulo cae dentro de su
 * columna. Devuelve false en las páginas sin cabecera (portadas) y, sobre
 * todo, si reeditan el documento con otras medidas.
 */
function validaCabecera(lineas: FragmentoPdf[][]): boolean {
  for (const linea of lineas) {
    let aciertos = 0;
    for (const [columna, rotulo] of Object.entries(ROTULOS) as [Columna, string][]) {
      const frag = linea.find((f) => f.texto.trim().toUpperCase().startsWith(rotulo));
      if (frag && columnaDe(frag.x) === columna) aciertos++;
    }
    // Se exige la cabecera prácticamente completa: así una fila de datos que
    // empiece por las mismas letras no se confunde con ella.
    if (aciertos >= Object.keys(ROTULOS).length - 1) return true;
  }
  return false;
}

/** Reparte los fragmentos de una línea en columnas. */
function repartir(linea: FragmentoPdf[]): Fila {
  const fila: Fila = {};

  for (const frag of linea) {
    const columna = columnaDe(frag.x);
    fila[columna] = fila[columna] ? `${fila[columna]} ${frag.texto}` : frag.texto;
  }

  return fila;
}

/** Agrupa fragmentos sueltos en líneas visuales, de arriba abajo. */
function agruparLineas(frags: readonly FragmentoPdf[]): FragmentoPdf[][] {
  const ordenados = [...frags].sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas: FragmentoPdf[][] = [];
  let actual: FragmentoPdf[] = [];

  for (const frag of ordenados) {
    if (actual.length && Math.abs(actual[0].y - frag.y) > TOLERANCIA_LINEA) {
      lineas.push(actual.sort((a, b) => a.x - b.x));
      actual = [];
    }
    actual.push(frag);
  }
  if (actual.length) lineas.push(actual.sort((a, b) => a.x - b.x));

  return lineas;
}

function construye(filas: readonly Fila[]): EmpresaInscrita | null {
  const junta = (c: Columna) => cose(filas.map((f) => f[c] ?? ""));

  const cif = junta("CIF").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  // El CIF es la garantía de que la fila es un registro y no un resto de
  // cabecera o de pie: letra + 8 dígitos, o 8 dígitos + letra (autónomos).
  if (!/^[A-Z]\d{8}$/.test(cif) && !/^\d{8}[A-Z]$/.test(cif)) return null;

  const habilitaciones: MapaHabilitaciones = {};
  for (const h of HABILITACIONES) {
    // Solo la primera línea del registro lleva la marca; el resto va vacío.
    const valor = junta(h.codigo).replace(/[^EAN]/gi, "").toUpperCase();
    const ambito = valor[0];
    if (ambito === "E" || ambito === "A") {
      habilitaciones[h.codigo] = ambito as AmbitoHabilitacion;
    }
  }

  return {
    numero: junta("NUMERO").replace(/\s/g, ""),
    nombre: junta("EMPRESA"),
    cif,
    domicilio: junta("DOMICILIO"),
    localidad: junta("LOCALIDAD"),
    provincia: junta("PROVINCIA"),
    ccaa: junta("AUTONOMIA"),
    habilitaciones,
    email: junta("EMAIL").replace(/\s/g, ""),
  };
}

/**
 * Convierte los fragmentos de texto de cada página en registros del listado.
 *
 * Separado de la lectura del PDF para poder probarlo con fragmentos
 * sintéticos, sin arrastrar un PDF de 17 MB como fixture.
 *
 * @param paginas Fragmentos de cada página, en orden.
 */
export function extraeEmpresas(
  paginas: readonly (readonly FragmentoPdf[])[]
): EmpresaInscrita[] {
  const out: EmpresaInscrita[] = [];

  for (const frags of paginas) {
    const lineas = agruparLineas(frags);
    if (!validaCabecera(lineas)) continue;

    // Un registro empieza cuando hay algo en la columna NÚMERO y se prolonga
    // por las líneas de continuación, que la llevan vacía.
    let acumulado: Fila[] = [];
    const cerrar = () => {
      if (!acumulado.length) return;
      const empresa = construye(acumulado);
      if (empresa) out.push(empresa);
      acumulado = [];
    };

    for (const linea of lineas) {
      const fila = repartir(linea);
      if ((fila.NUMERO ?? "").trim()) cerrar();
      acumulado.push(fila);
    }
    cerrar();
  }

  // El mismo registro no debería salir dos veces, pero si el listado repite un
  // CIF nos quedamos con la primera aparición para no duplicar empresas.
  const vistos = new Set<string>();
  return out.filter((e) => (vistos.has(e.cif) ? false : (vistos.add(e.cif), true)));
}

/**
 * Extrae el listado completo de un PDF del registro.
 *
 * @param pdf Contenido binario del PDF.
 */
export async function parseListadoPolicia(pdf: Buffer): Promise<EmpresaInscrita[]> {
  // Igual que en `lib/borme.ts` y en el parser de Cepreven: se importa desde
  // lib/ para saltarse el index.js, que lee un PDF de prueba al cargar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as any;

  const paginas: FragmentoPdf[][] = [];

  await pdfParse(pdf, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pagerender: async (pagina: any) => {
      const contenido = await pagina.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });

      const frags: FragmentoPdf[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of contenido.items as any[]) {
        if (!item.str.trim()) continue;
        const t = item.transform as number[];
        frags.push({ texto: item.str, x: t[4], y: t[5] });
      }
      paginas.push(frags);

      return "";
    },
  });

  return extraeEmpresas(paginas);
}
