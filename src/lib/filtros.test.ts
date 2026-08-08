import { describe, expect, it } from "vitest";
import { getSelectionStats, isInFilter, type RawProps } from "./filtros";
import { FILTROS_DEFAULT } from "@/types";
import type { FiltrosActivos } from "@/types";

// Builder mínimo de RawProps para tests
function makeProps(overrides: Partial<RawProps> = {}): RawProps {
  return {
    id: 1,
    nombre: "TEST SL",
    cif: "B00000000",
    provincia: "Madrid",
    ccaa: "Madrid",
    sector: "PCI",
    grupoId: null,
    grupoNombre: null,
    enPerimetro: true,
    cepreven: null,
    aerme: false,
    dealStage: null,
    ingresos: 1_000_000,
    margenBrutoPct: 50,
    ebitdaPct: 10,
    empleados: 20,
    ...overrides,
  } as RawProps;
}

function makeFiltros(overrides: Partial<FiltrosActivos> = {}): FiltrosActivos {
  return { ...FILTROS_DEFAULT, ...overrides };
}

describe("isInFilter — filtro crmStage con sentinel sin_crm", () => {
  it("sin filtros activos: pasa cualquier empresa", () => {
    expect(isInFilter(makeProps(), makeFiltros(), "")).toBe(true);
  });

  it("filtro=['sin_crm']: pasa empresa con dealStage null", () => {
    const f = makeFiltros({ crmStage: ["sin_crm"] });
    expect(isInFilter(makeProps({ dealStage: null }), f, "")).toBe(true);
  });

  it("filtro=['sin_crm']: rechaza empresa con dealStage='identificado'", () => {
    const f = makeFiltros({ crmStage: ["sin_crm"] });
    expect(isInFilter(makeProps({ dealStage: "identificado" }), f, "")).toBe(false);
  });

  it("filtro=['identificado']: rechaza empresa con dealStage null (Sin CRM)", () => {
    const f = makeFiltros({ crmStage: ["identificado"] });
    expect(isInFilter(makeProps({ dealStage: null }), f, "")).toBe(false);
  });

  it("filtro=['identificado']: pasa empresa con dealStage='identificado'", () => {
    const f = makeFiltros({ crmStage: ["identificado"] });
    expect(isInFilter(makeProps({ dealStage: "identificado" }), f, "")).toBe(true);
  });

  it("filtro=['sin_crm','identificado']: pasa ambos", () => {
    const f = makeFiltros({ crmStage: ["sin_crm", "identificado"] });
    expect(isInFilter(makeProps({ dealStage: null }), f, "")).toBe(true);
    expect(isInFilter(makeProps({ dealStage: "identificado" }), f, "")).toBe(true);
    // contactado queda fuera
    expect(isInFilter(makeProps({ dealStage: "contactado" }), f, "")).toBe(false);
  });

  it("filtro=['contactado']: rechaza Sin CRM y rechaza identificado", () => {
    const f = makeFiltros({ crmStage: ["contactado"] });
    expect(isInFilter(makeProps({ dealStage: null }), f, "")).toBe(false);
    expect(isInFilter(makeProps({ dealStage: "identificado" }), f, "")).toBe(false);
    expect(isInFilter(makeProps({ dealStage: "contactado" }), f, "")).toBe(true);
  });
});

describe("getSelectionStats", () => {
  it("cuenta y suma únicamente las empresas que cumplen filtros y búsqueda", () => {
    const empresas = [
      { properties: makeProps({ id: 1, nombre: "ALFA SL", ingresos: 1_500_000, enPerimetro: true }) },
      { properties: makeProps({ id: 2, nombre: "BETA SL", ingresos: 2_000_000, enPerimetro: false }) },
      { properties: makeProps({ id: 3, nombre: "ALFA NORTE SL", ingresos: null, enPerimetro: true }) },
    ];

    expect(
      getSelectionStats(empresas, makeFiltros({ enPerimetro: true }), "alfa"),
    ).toEqual({ count: 2, totalIngresos: 1_500_000 });
  });

  it("devuelve ceros mientras las empresas todavía no están cargadas", () => {
    expect(getSelectionStats(null, makeFiltros(), "")).toEqual({
      count: 0,
      totalIngresos: 0,
    });
  });
});

describe("isInFilter — filtro por habilitación de seguridad privada", () => {
  const conCRA = makeProps({ habilitaciones: { INS: "A", CA: "E" } });
  const soloInstala = makeProps({ habilitaciones: { INS: "A" } });
  const sinRegistro = makeProps({ habilitaciones: null });

  it("sin filtro, no excluye a nadie", () => {
    expect(isInFilter(sinRegistro, makeFiltros(), "")).toBe(true);
  });

  it("filtra por una habilitación concreta", () => {
    const f = makeFiltros({ habilitaciones: ["CA"] });
    expect(isInFilter(conCRA, f, "")).toBe(true);
    expect(isInFilter(soloInstala, f, "")).toBe(false);
  });

  it("deja fuera a las empresas sin datos de registro", () => {
    const f = makeFiltros({ habilitaciones: ["INS"] });
    expect(isInFilter(sinRegistro, f, "")).toBe(false);
  });

  it("con varias marcadas, exige TODAS", () => {
    // Son atributos acumulables: marcar dos es acotar, no ampliar.
    const f = makeFiltros({ habilitaciones: ["INS", "CA"] });
    expect(isInFilter(conCRA, f, "")).toBe(true);
    expect(isInFilter(soloInstala, f, "")).toBe(false);
  });

  it("acota por ámbito cuando se pide uno", () => {
    expect(isInFilter(conCRA, makeFiltros({ habilitaciones: ["CA"], habilitacionAmbito: "E" }), "")).toBe(true);
    expect(isInFilter(conCRA, makeFiltros({ habilitaciones: ["CA"], habilitacionAmbito: "A" }), "")).toBe(false);
    // La instalación de esta empresa sí es autonómica.
    expect(isInFilter(conCRA, makeFiltros({ habilitaciones: ["INS"], habilitacionAmbito: "A" }), "")).toBe(true);
  });

  it("el ámbito se aplica a todas las habilitaciones marcadas", () => {
    // INS es autonómica y CA estatal: no puede cumplir "ambas estatales".
    const f = makeFiltros({ habilitaciones: ["INS", "CA"], habilitacionAmbito: "E" });
    expect(isInFilter(conCRA, f, "")).toBe(false);
  });
});

describe("isInFilter — filtro por estado Cepreven", () => {
  const calificada = makeProps({ cepreven: "calificada" });
  const asociada = makeProps({ cepreven: "asociada" });
  const ninguna = makeProps({ cepreven: null });

  it("sin filtro, pasan las tres", () => {
    const f = makeFiltros();
    expect([calificada, asociada, ninguna].every((p) => isInFilter(p, f, ""))).toBe(true);
  });

  it("'calificada' no cuela a las meramente asociadas", () => {
    // Es el filtro que pidió Alberto: calificada es un rango superior.
    const f = makeFiltros({ cepreven: "calificada" });
    expect(isInFilter(calificada, f, "")).toBe(true);
    expect(isInFilter(asociada, f, "")).toBe(false);
    expect(isInFilter(ninguna, f, "")).toBe(false);
  });

  it("'asociada' no incluye a las calificadas", () => {
    const f = makeFiltros({ cepreven: "asociada" });
    expect(isInFilter(asociada, f, "")).toBe(true);
    expect(isInFilter(calificada, f, "")).toBe(false);
  });

  it("'cualquiera' acepta ambos estados", () => {
    const f = makeFiltros({ cepreven: "cualquiera" });
    expect(isInFilter(calificada, f, "")).toBe(true);
    expect(isInFilter(asociada, f, "")).toBe(true);
    expect(isInFilter(ninguna, f, "")).toBe(false);
  });

  it("'ninguna' deja solo a las que no constan", () => {
    const f = makeFiltros({ cepreven: "ninguna" });
    expect(isInFilter(ninguna, f, "")).toBe(true);
    expect(isInFilter(calificada, f, "")).toBe(false);
  });

  it("trata la cadena vacía como 'no consta'", () => {
    const f = makeFiltros({ cepreven: "ninguna" });
    expect(isInFilter(makeProps({ cepreven: "" }), f, "")).toBe(true);
  });
});

describe("isInFilter — filtro por categoría RIPCI", () => {
  const instalaYMantiene = makeProps({
    ripci: {
      instalacion: ["Detección y alarma de incendios", "Columna seca"],
      mantenimiento: ["Extintores de incendios"],
    },
  });
  const sinRipci = makeProps({ ripci: null });

  it("sin categorías marcadas no excluye a nadie", () => {
    expect(isInFilter(sinRipci, makeFiltros(), "")).toBe(true);
  });

  it("filtra por una categoría", () => {
    const f = makeFiltros({ ripciCategorias: ["Columna seca"] });
    expect(isInFilter(instalaYMantiene, f, "")).toBe(true);
    expect(isInFilter(sinRipci, f, "")).toBe(false);
  });

  it("distingue instalar de mantener", () => {
    // Extintores solo lo mantiene; no existe como categoría de instalación.
    const cat = ["Extintores de incendios"];
    expect(isInFilter(instalaYMantiene, makeFiltros({ ripciCategorias: cat, ripciSeccion: "mantenimiento" }), "")).toBe(true);
    expect(isInFilter(instalaYMantiene, makeFiltros({ ripciCategorias: cat, ripciSeccion: "instalacion" }), "")).toBe(false);
  });

  it("con varias marcadas las exige todas", () => {
    const f = makeFiltros({ ripciCategorias: ["Columna seca", "Espuma física"] });
    expect(isInFilter(instalaYMantiene, f, "")).toBe(false);
  });
});
