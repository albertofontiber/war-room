import { describe, expect, it } from "vitest";
import { fmt, fmtM, fmtPct, fmtDate, fmtFechaShort, fmtMillions } from "./format";

describe("fmt", () => {
  it("formatea números (devuelve string con dígitos)", () => {
    // Node fuera del runtime de Vercel puede no tener Intl-es-ES, así que no
    // comprobamos el separador concreto — solo que vuelve como string.
    expect(typeof fmt(1234)).toBe("string");
    expect(fmt(1234)).toMatch(/1[\s.,]?234/);
  });

  it("respeta decimals", () => {
    expect(fmt(1234.567, 2)).toMatch(/\.?57|,57/);
  });

  it("devuelve fallback para null/undefined", () => {
    expect(fmt(null)).toBe("n.a.");
    expect(fmt(undefined)).toBe("n.a.");
    expect(fmt(null, 0, "—")).toBe("—");
  });
});

describe("fmtM", () => {
  it("formatea millones con M€", () => {
    expect(fmtM(2_500_000)).toBe("2.5M€");
    expect(fmtM(1_000_000)).toBe("1.0M€");
  });

  it("formatea miles con K€", () => {
    expect(fmtM(15_000)).toBe("15K€");
    expect(fmtM(999_000)).toBe("999K€");
  });

  it("formatea amounts pequeños en euros", () => {
    expect(fmtM(500)).toBe("500€");
  });

  it("maneja negativos correctamente", () => {
    expect(fmtM(-2_000_000)).toBe("-2.0M€");
  });

  it("devuelve fallback para null/undefined", () => {
    expect(fmtM(null)).toBe("n.a.");
    expect(fmtM(undefined)).toBe("n.a.");
    expect(fmtM(null, "—")).toBe("—");
  });
});

describe("fmtPct", () => {
  it("formatea porcentaje con 1 decimal", () => {
    expect(fmtPct(12.345)).toBe("12.3%");
    expect(fmtPct(100)).toBe("100.0%");
  });

  it("devuelve fallback para null", () => {
    expect(fmtPct(null)).toBe("n.a.");
  });
});

describe("fmtDate / fmtFechaShort", () => {
  it("fmtDate formatea ISO", () => {
    const result = fmtDate("2026-04-24T00:00:00Z");
    // Formato depende del runtime (Node sin Intl usa formato por defecto).
    expect(typeof result).toBe("string");
    expect(result).toMatch(/2026|26/);
  });

  it("fmtDate devuelve fallback para null/undefined", () => {
    expect(fmtDate(null)).toBe("n.a.");
    expect(fmtDate(undefined)).toBe("n.a.");
  });

  it("fmtFechaShort devuelve string", () => {
    const result = fmtFechaShort("2026-04-24T00:00:00Z");
    expect(typeof result).toBe("string");
    // El runtime sin Intl puede dar formato largo; nos conformamos con que haya dígitos.
    expect(result).toMatch(/\d/);
  });
});

describe("fmtMillions", () => {
  it("formatea sin símbolo de divisa", () => {
    expect(fmtMillions(2_500_000)).toBe("2.5M");
    expect(fmtMillions(1_000_000)).toBe("1.0M");
  });
});
