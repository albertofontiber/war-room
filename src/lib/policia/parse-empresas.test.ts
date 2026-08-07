import { describe, expect, it } from "vitest";
import { extraeEmpresas, type FragmentoPdf } from "./parse-empresas";

/** Posiciones reales de la tabla, tomadas de la edición de 01/02/2026. */
const X = {
  numero: 84, fecha: 102, empresa: 136, guion: 213, cif: 228, domicilio: 269,
  localidad: 353, provincia: 406, ccaa: 455,
  VJ: 505, PP: 519, INS: 533, DF: 554, TF: 569, CA: 583, DE: 597, TE: 611,
  email: 625,
};

/** Fila de cabecera: sin ella el parser descarta la página entera. */
function cabecera(y: number): FragmentoPdf[] {
  return [
    { texto: "FECHA", x: 104, y },
    { texto: "EMPRESA", x: 163, y },
    { texto: "CIF", x: 242, y },
    { texto: "DOMICILIO", x: 291, y },
    { texto: "LOCALIDAD", x: 357, y },
    { texto: "PROVINCIA", x: 410, y },
    { texto: "AUTONOMIA", x: 457, y },
    { texto: "VJ", x: 507, y },
    { texto: "PP", x: 520, y },
    { texto: "INS", x: 537, y },
    { texto: "DF", x: 556, y },
    { texto: "TF", x: 570, y },
    { texto: "CA", x: 584, y },
    { texto: "DE", x: 598, y },
    { texto: "TE", x: 613, y },
    { texto: "COR ELECTRO", x: 673, y },
  ];
}

/** Primera línea de un registro, con sus ocho marcas de habilitación. */
function fila(
  y: number,
  numero: string,
  nombre: string,
  cif: string,
  marcas: string,
  extra: FragmentoPdf[] = []
): FragmentoPdf[] {
  const cods = ["VJ", "PP", "INS", "DF", "TF", "CA", "DE", "TE"] as const;
  return [
    { texto: numero, x: X.numero, y },
    { texto: nombre, x: X.empresa, y },
    { texto: cif, x: X.cif, y },
    { texto: "MADRID", x: X.localidad, y },
    { texto: "MADRID", x: X.provincia, y },
    { texto: "MADRID", x: X.ccaa, y },
    ...cods.map((c, i) => ({ texto: marcas[i], x: X[c], y })),
    ...extra,
  ];
}

describe("extraeEmpresas", () => {
  it("lee las habilitaciones concedidas y descarta las marcadas N", () => {
    const empresas = extraeEmpresas([
      [...cabecera(493), ...fila(477, "294", "SEGURIDAD MARXAN, S.A.", "A25022740", "NNANNNNN")],
    ]);

    expect(empresas).toHaveLength(1);
    expect(empresas[0].habilitaciones).toEqual({ INS: "A" });
    expect(empresas[0].cif).toBe("A25022740");
  });

  it("conserva el ámbito de cada habilitación por separado", () => {
    // El caso que motiva todo esto: instala con licencia autonómica pero
    // tiene la central de alarmas con licencia estatal.
    const empresas = extraeEmpresas([
      [...cabecera(493), ...fila(477, "412", "PROTECCION ASESORES, S.A.", "A37049541", "NNANNENN")],
    ]);

    expect(empresas[0].habilitaciones).toEqual({ INS: "A", CA: "E" });
  });

  it("junta el CIF partido entre dos líneas", () => {
    // El dígito de control cae en la línea siguiente.
    const empresas = extraeEmpresas([
      [
        ...cabecera(493),
        ...fila(477, "294", "SEGURIDAD MARXAN", "A2502274", "NNANNNNN"),
        { texto: "S.A.", x: X.empresa, y: 468 },
        { texto: "0", x: X.cif, y: 468 },
      ],
    ]);

    expect(empresas[0].cif).toBe("A25022740");
    expect(empresas[0].nombre).toBe("SEGURIDAD MARXAN S.A.");
  });

  it("cose las palabras partidas con guión al final de línea", () => {
    const empresas = extraeEmpresas([
      [
        ...cabecera(493),
        ...fila(456, "307", "DIM SEGURIDAD AU", "B2871294", "NNENNNNN", [
          { texto: "-", x: X.guion, y: 456 },
        ]),
        { texto: "DIOVISUALES, S.L.", x: X.empresa, y: 446 },
        { texto: "1", x: X.cif, y: 446 },
      ],
    ]);

    expect(empresas[0].nombre).toBe("DIM SEGURIDAD AUDIOVISUALES, S.L.");
  });

  it("respeta los guiones que forman parte del nombre", () => {
    const empresas = extraeEmpresas([
      [...cabecera(493), ...fila(477, "148", "TECNICAS ANTI-ROBO S.L.", "B33020850", "NNANNNNN")],
    ]);

    expect(empresas[0].nombre).toBe("TECNICAS ANTI-ROBO S.L.");
  });

  it("descarta la página entera si no reconoce la cabecera", () => {
    // Fallo ruidoso: si reeditan la tabla con otro ancho de columnas, es
    // preferible no devolver nada a repartir los datos en columnas erróneas.
    const empresas = extraeEmpresas([
      [...fila(477, "294", "SEGURIDAD MARXAN, S.A.", "A25022740", "NNANNNNN")],
    ]);

    expect(empresas).toEqual([]);
  });

  it("ignora las líneas que no son registros", () => {
    const empresas = extraeEmpresas([
      [
        ...cabecera(493),
        { texto: "*E: Estatal *A: Autonómico", x: 60, y: 520 },
        ...fila(477, "294", "SEGURIDAD MARXAN, S.A.", "A25022740", "NNANNNNN"),
      ],
    ]);

    expect(empresas).toHaveLength(1);
  });

  it("no repite una empresa que aparezca dos veces", () => {
    const uno = [...cabecera(493), ...fila(477, "294", "MARXAN, S.A.", "A25022740", "NNANNNNN")];
    expect(extraeEmpresas([uno, uno])).toHaveLength(1);
  });

  it("admite el CIF de un autónomo (8 dígitos y letra)", () => {
    const empresas = extraeEmpresas([
      [...cabecera(493), ...fila(477, "500", "JUAN PEREZ", "12345678Z", "NNANNNNN")],
    ]);

    expect(empresas[0].cif).toBe("12345678Z");
  });
});
