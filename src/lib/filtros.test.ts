import { describe, expect, it } from "vitest";
import { isInFilter, type RawProps } from "./filtros";
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
