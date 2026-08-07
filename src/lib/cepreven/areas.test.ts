import { describe, expect, it } from "vitest";
import { agruparPorFamilia, esAreaValida, AREAS_CEPREVEN } from "./areas";

describe("agruparPorFamilia", () => {
  it("agrupa las áreas por familia en el orden del catálogo", () => {
    // Caso real: Chemtrol, calificada como instaladora y como mantenedora.
    const grupos = agruparPorFamilia([
      "MANT-DAI",
      "EAA-RO",
      "DAI",
      "MANT-MMP",
      "EAA-RE",
    ]);

    expect(grupos.map((g) => g.familia)).toEqual(["instalador", "mantenimiento"]);
    expect(grupos[0].areas.map((a) => a.etiqueta)).toEqual([
      "Detección automática de incendio",
      "Rociadores riesgo ordinario",
      "Rociadores riesgo extra",
    ]);
    expect(grupos[1].areas.map((a) => a.etiqueta)).toEqual([
      "Detección automática",
      "Medios manuales de PCI",
    ]);
  });

  it("no devuelve familias sin áreas", () => {
    const grupos = agruparPorFamilia(["ING-AGUA"]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].familia).toBe("ingenieria");
  });

  it("ignora códigos desconocidos en vez de romperse", () => {
    // La ficha lee JSON de la base: puede traer un código retirado.
    expect(agruparPorFamilia(["DAI", "CODIGO-QUE-NO-EXISTE"])).toEqual([
      { familia: "instalador", areas: [AREAS_CEPREVEN[0]] },
    ]);
  });

  it("devuelve vacío sin áreas", () => {
    expect(agruparPorFamilia([])).toEqual([]);
  });

  it("distingue el mismo título en familias distintas", () => {
    // "Detección automática" existe en ingeniería y en mantenimiento; el
    // código es lo que las separa.
    const grupos = agruparPorFamilia(["ING-DAI", "MANT-DAI"]);
    expect(grupos.map((g) => g.familia)).toEqual(["ingenieria", "mantenimiento"]);
  });
});

describe("esAreaValida", () => {
  it("acepta los códigos del catálogo y rechaza el resto", () => {
    expect(esAreaValida("EAA-RO")).toBe(true);
    expect(esAreaValida("MANT-MMP")).toBe(true);
    expect(esAreaValida("INVENTADO")).toBe(false);
  });
});

describe("catálogo", () => {
  it("no tiene códigos repetidos", () => {
    const codigos = AREAS_CEPREVEN.map((a) => a.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("no repite el par familia+título, que es la clave del parser", () => {
    const claves = AREAS_CEPREVEN.map((a) => `${a.familia}|${a.tituloPdf}`);
    expect(new Set(claves).size).toBe(claves.length);
  });
});
