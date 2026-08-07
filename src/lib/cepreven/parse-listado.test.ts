import { describe, expect, it } from "vitest";
import { extraeListado, type Fragmento } from "./parse-listado";

/**
 * Los fragmentos reproducen el maquetado del PDF real (medidas tomadas de la
 * edición 62): familia a 17pt, área a 11pt, empresas a 9pt en dos columnas
 * (x=70 la izquierda, x=339 la derecha).
 */
const ANCHO_POR_CARACTER = 4.6;

function frag(
  texto: string,
  x: number,
  y: number,
  tam: number,
  ancho = texto.length * ANCHO_POR_CARACTER
): Fragmento {
  return { texto, x, ancho, y, tam };
}

function familia(texto: string, y: number): Fragmento {
  return frag(texto, 78, y, 17);
}

function area(texto: string, y: number): Fragmento {
  return frag(texto, 85, y, 11);
}

/** Una fila de empresas: izquierda y, opcionalmente, derecha. */
function fila(izquierda: string, derecha: string | null, y: number): Fragmento[] {
  const out = [frag(izquierda, 70, y, 9)];
  if (derecha) out.push(frag(derecha, 339, y, 9));
  return out;
}

describe("extraeListado", () => {
  it("asigna las empresas de ambas columnas al área abierta", () => {
    const listado = extraeListado([
      [
        familia("Instaladores de Sistemas de Detección / Extinción", 774),
        area("DETECCIÓN AUTOMÁTICA DE INCENDIO", 721),
        area("AUTOMATIC FIRE DETECTION SYSTEMS", 708),
        ...fila("AIR FEU, S.L.", "IBEREXT, S.A.", 687),
        ...fila("CHACARREX, S.L.", null, 676),
      ],
    ]);

    expect(listado.areasVistas).toEqual(["DAI"]);
    expect(listado.empresas).toEqual([
      { nombre: "AIR FEU, S.L.", areas: ["DAI"] },
      { nombre: "CHACARREX, S.L.", areas: ["DAI"] },
      { nombre: "IBEREXT, S.A.", areas: ["DAI"] },
    ]);
  });

  it("ignora la cabecera en inglés, que no casa con el catálogo", () => {
    const listado = extraeListado([
      [
        familia("Instaladores de Sistemas de Detección / Extinción", 774),
        area("DETECCIÓN AUTOMÁTICA DE INCENDIO", 721),
        area("AUTOMATIC FIRE DETECTION SYSTEMS", 708),
        ...fila("SURIS, S.L.", null, 687),
      ],
    ]);

    expect(listado.areasVistas).toEqual(["DAI"]);
    expect(listado.empresas).toHaveLength(1);
  });

  it("desambigua por familia las áreas que comparten título", () => {
    // "Sistemas de extinción por agua" existe en ingeniería y en mantenimiento.
    const listado = extraeListado([
      [
        familia("Ingenierías en Protección contra Incendios", 811),
        area("SISTEMAS DE EXTINCIÓN POR AGUA", 788),
        ...fila("ESPARPLANT", null, 770),
        familia("Mantenedores de Sistemas de Protección Activa contra Incendios", 575),
        area("SISTEMAS DE EXTINCIÓN POR AGUA", 445),
        ...fila("SUPRA SEGURIDAD, S.L", null, 430),
      ],
    ]);

    expect(listado.areasVistas).toEqual(["ING-AGUA", "MANT-EAA"]);
    expect(listado.empresas).toEqual([
      { nombre: "ESPARPLANT", areas: ["ING-AGUA"] },
      { nombre: "SUPRA SEGURIDAD, S.L", areas: ["MANT-EAA"] },
    ]);
  });

  it("reconstruye un título de familia troceado sin inventar espacios", () => {
    // El PDF real parte este título en "Mantenedor" + "e" + "s de Sistemas…".
    // Si se unieran con espacios, la familia no se reconocería y las empresas
    // caerían en el área de ingeniería anterior.
    const listado = extraeListado([
      [
        frag("Mantenedor", 72, 575, 17, 87),
        frag("e", 159, 575, 17, 9),
        frag("s de Sistemas de Protección Activa contra Incendios", 168, 575, 17, 340),
        area("MEDIOS MANUALES DE PROTECCIÓN CONTRA INCENDIOS", 106),
        ...fila("PACISA", null, 90),
      ],
    ]);

    expect(listado.areasVistas).toEqual(["MANT-MMP"]);
  });

  it("respeta el hueco del subíndice perdido en CO₂", () => {
    // "CO2 BAJA PRESIÓN" llega como "CO" + "BAJA PRESIÓN" porque el subíndice
    // no se extrae. Concatenar sin más daría "COBAJA PRESIÓN".
    const listado = extraeListado([
      [
        familia("Instaladores de Sistemas de Detección / Extinción", 830),
        area("EXTINCIÓN AUTOMÁTICA POR GAS", 798),
        frag("CO", 85, 784, 11, 13),
        frag("BAJA PRESIÓN", 104, 784, 11, 66),
        ...fila("SIEMENS, SA", null, 770),
      ],
    ]);

    expect(listado.areasVistas).toEqual(["EAG-B"]);
  });

  it("une fragmentos pegados de una razón social", () => {
    const listado = extraeListado([
      [
        familia("Instaladores de Sistemas de Detección / Extinción", 774),
        area("DETECCIÓN AUTOMÁTICA DE INCENDIO", 721),
        // "ARCE " ya trae el espacio final: no hay que añadir otro.
        frag("ARCE ", 70, 687, 9, 21),
        frag("CLIMA, S.L.", 91, 687, 9, 48),
      ],
    ]);

    expect(listado.empresas).toEqual([
      { nombre: "ARCE CLIMA, S.L.", areas: ["DAI"] },
    ]);
  });

  it("acumula las áreas de una empresa que aparece en varias", () => {
    const listado = extraeListado([
      [
        familia("Instaladores de Sistemas de Detección / Extinción", 830),
        area("DETECCIÓN AUTOMÁTICA DE INCENDIO", 800),
        ...fila("IBEREXT, S.A.", null, 780),
        area("ROCIADORES RIESGO ORDINARIO", 700),
        ...fila("IBEREXT, S.A.", null, 680),
        area("ROCIADORES RIESGO EXTRA", 600),
        ...fila("IBEREXT, S.A.", null, 580),
      ],
    ]);

    expect(listado.empresas).toEqual([
      { nombre: "IBEREXT, S.A.", areas: ["DAI", "EAA-RO", "EAA-RE"].sort() },
    ]);
  });

  it("no arrastra el área abierta de una página a la siguiente", () => {
    const listado = extraeListado([
      [
        familia("Instaladores de Sistemas de Detección / Extinción", 774),
        area("DETECCIÓN AUTOMÁTICA DE INCENDIO", 721),
        ...fila("AIR FEU, S.L.", null, 687),
      ],
      // Página sin cabecera de área: su contenido no debe colgar de DAI.
      [frag("Texto suelto de una portada", 70, 700, 9)],
    ]);

    expect(listado.empresas).toEqual([
      { nombre: "AIR FEU, S.L.", areas: ["DAI"] },
    ]);
  });

  it("cierra el área cuando aparece la prosa del pie de página", () => {
    const listado = extraeListado([
      [
        familia("Instaladores de Soluciones de Protección Pasiva contra el Fuego", 401),
        area("PROTECCIÓN DE ESTRUCTURAS", 146),
        ...fila("FUEGODIEZ, S.L.", null, 130),
        area("Las áreas en las que se encuentran calificadas pueden consultarse en", 55),
        ...fila("www.cepreven.com", null, 40),
      ],
    ]);

    expect(listado.empresas).toEqual([
      { nombre: "FUEGODIEZ, S.L.", areas: ["PAS-ESTR"] },
    ]);
  });

  it("resuelve los títulos de área partidos en dos líneas", () => {
    const listado = extraeListado([
      [
        familia("Instaladores de Soluciones de Protección Pasiva contra el Fuego", 401),
        area("SISTEMAS Y SOLUCIONES DE", 374),
        area("LIMITACIÓN A LA PROPAGACIÓN", 360),
        area("FIRE COMPARTMENTATION", 347),
        ...fila("IBEREXT, S.A.", null, 330),
      ],
    ]);

    expect(listado.areasVistas).toEqual(["PAS-COMP"]);
  });

  it("descarta los subtítulos de maquetado que no son empresas", () => {
    const listado = extraeListado([
      [
        familia("Instaladores de Sistemas de Detección / Extinción", 830),
        area("EXTINCIÓN AUTOMÁTICA POR AGUA", 800),
        area("ROCIADORES RIESGO ORDINARIO", 786),
        area("OH SPRINKLER SYSTEMS", 772),
        ...fila("PACISA", null, 750),
      ],
    ]);

    expect(listado.empresas).toEqual([{ nombre: "PACISA", areas: ["EAA-RO"] }]);
  });
});
