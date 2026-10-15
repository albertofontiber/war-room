import { describe, expect, it } from "vitest";
import { aliasDeGrupo, detectarGrupo, grupoPorAlias } from "./borme-senales";

describe("detectarGrupo — Attlon con la errata ATLON del BORME", () => {
  it("detecta la compra con socio único ATLON TECHNOLOGIES", () => {
    const acto =
      "Declaración de unipersonalidad. Socio único: ATLON TECHNOLOGIES SOCIEDAD LIMITADA. Ceses/Dimisiones.";
    expect(detectarGrupo(acto)).toEqual({
      grupoNombre: "Attlon",
      personaDetectada: null,
      motivo: "socio_unico",
    });
  });

  it("sigue detectando la grafía correcta", () => {
    expect(detectarGrupo("Socio único: ATTLON TECHNOLOGIES SL.")?.grupoNombre).toBe("Attlon");
  });

  it("no confunde palabras que contienen ATLON", () => {
    expect(detectarGrupo("Socio único: CLUB PENTATLON MODERNO SL.")).toBeNull();
  });
});

describe("alias de grupo", () => {
  it("resuelve el alias al nombre del grupo, sin distinguir mayúsculas", () => {
    expect(grupoPorAlias("atlon")).toBe("Attlon");
    expect(grupoPorAlias("ATLON")).toBe("Attlon");
    expect(grupoPorAlias("attlon")).toBeNull(); // el nombre real no es un alias
    expect(grupoPorAlias("vesta")).toBeNull();
  });

  it("devuelve los alias de un grupo", () => {
    expect(aliasDeGrupo("Attlon")).toEqual(["Atlon"]);
    expect(aliasDeGrupo("Scutum")).toEqual([]);
  });
});
