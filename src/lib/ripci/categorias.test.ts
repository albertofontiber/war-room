import { describe, expect, it } from "vitest";
import { cumpleFiltroRipci, parseRipci } from "./categorias";

describe("parseRipci", () => {
  it("lee las dos secciones y las ordena según el catálogo", () => {
    const r = parseRipci({
      instalacion: ["Columna seca", "Detección y alarma de incendios"],
      mantenimiento: ["Extintores de incendios"],
    });

    // "Detección" va antes que "Columna seca" en el registro.
    expect(r).toEqual({
      instalacion: ["Detección y alarma de incendios", "Columna seca"],
      mantenimiento: ["Extintores de incendios"],
    });
  });

  it("descarta categorías que no están en el catálogo", () => {
    const r = parseRipci({ instalacion: ["Columna seca", "Inventada"], mantenimiento: [] });
    expect(r).toEqual({ instalacion: ["Columna seca"], mantenimiento: [] });
  });

  it("devuelve null si no queda nada", () => {
    expect(parseRipci({ instalacion: [], mantenimiento: [] })).toBeNull();
    expect(parseRipci(null)).toBeNull();
    expect(parseRipci("vaya")).toBeNull();
    expect(parseRipci(["array"])).toBeNull();
  });

  it("admite que solo haya una de las dos secciones", () => {
    const r = parseRipci({ mantenimiento: ["Extintores de incendios"] });
    expect(r).toEqual({ instalacion: [], mantenimiento: ["Extintores de incendios"] });
  });
});

describe("cumpleFiltroRipci", () => {
  const empresa = parseRipci({
    instalacion: ["Detección y alarma de incendios", "Columna seca"],
    mantenimiento: ["Extintores de incendios", "Columna seca"],
  });

  it("sin categorías marcadas no excluye a nadie", () => {
    expect(cumpleFiltroRipci(null, [], null)).toBe(true);
  });

  it("deja fuera a las empresas sin datos de RIPCI", () => {
    expect(cumpleFiltroRipci(null, ["Columna seca"], null)).toBe(false);
  });

  it("busca en las dos secciones si no se especifica una", () => {
    expect(cumpleFiltroRipci(empresa, ["Extintores de incendios"], null)).toBe(true);
  });

  it("acota a la sección pedida", () => {
    // Extintores solo lo tiene en mantenimiento; de hecho no existe como
    // categoría de instalación.
    expect(cumpleFiltroRipci(empresa, ["Extintores de incendios"], "mantenimiento")).toBe(true);
    expect(cumpleFiltroRipci(empresa, ["Extintores de incendios"], "instalacion")).toBe(false);
  });

  it("con varias marcadas las exige TODAS", () => {
    expect(cumpleFiltroRipci(empresa, ["Columna seca", "Detección y alarma de incendios"], null)).toBe(true);
    expect(cumpleFiltroRipci(empresa, ["Columna seca", "Espuma física"], null)).toBe(false);
  });

  it("una categoría que la empresa solo mantiene no cuela como instalación", () => {
    expect(
      cumpleFiltroRipci(empresa, ["Detección y alarma de incendios"], "mantenimiento")
    ).toBe(false);
  });
});
