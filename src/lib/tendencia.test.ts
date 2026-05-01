/**
 * Tests para calcTendencia y enrichFinancieros — usados en /api/empresas/[id]
 * para mostrar las flechas ↑/→/↓ y los % calculados en el panel.
 */

import { describe, expect, it } from "vitest";
import { calcTendencia, enrichFinancieros } from "./tendencia";

describe("calcTendencia", () => {
  it("up cuando el último año supera al anterior por >5%", () => {
    const fin = [
      { anio: 2024, ingresos: 110, margenBruto: null, ebitda: null },
      { anio: 2023, ingresos: 100, margenBruto: null, ebitda: null },
    ];
    const r = calcTendencia(fin, "ingresos");
    expect(r?.direccion).toBe("up");
    expect(r?.variacionPct).toBeCloseTo(10, 5);
  });

  it("down cuando el último año cae más de un 5%", () => {
    const fin = [
      { anio: 2024, ingresos: 80, margenBruto: null, ebitda: null },
      { anio: 2023, ingresos: 100, margenBruto: null, ebitda: null },
    ];
    const r = calcTendencia(fin, "ingresos");
    expect(r?.direccion).toBe("down");
    expect(r?.variacionPct).toBeCloseTo(-20, 5);
  });

  it("flat cuando la variación está dentro de ±5%", () => {
    const fin = [
      { anio: 2024, ingresos: 102, margenBruto: null, ebitda: null },
      { anio: 2023, ingresos: 100, margenBruto: null, ebitda: null },
    ];
    expect(calcTendencia(fin, "ingresos")?.direccion).toBe("flat");
  });

  it("ordena descendentemente por año aunque entre desordenado", () => {
    // Pasamos los años al revés → la función debe ordenar internamente.
    const fin = [
      { anio: 2023, ingresos: 100, margenBruto: null, ebitda: null },
      { anio: 2024, ingresos: 200, margenBruto: null, ebitda: null },
    ];
    const r = calcTendencia(fin, "ingresos");
    expect(r?.direccion).toBe("up");
    expect(r?.variacionPct).toBeCloseTo(100, 5);
  });

  it("devuelve null si solo hay un año", () => {
    const fin = [{ anio: 2024, ingresos: 100, margenBruto: null, ebitda: null }];
    expect(calcTendencia(fin, "ingresos")).toBeNull();
  });

  it("devuelve null si el dato del último año es null", () => {
    const fin = [
      { anio: 2024, ingresos: null, margenBruto: null, ebitda: null },
      { anio: 2023, ingresos: 100, margenBruto: null, ebitda: null },
    ];
    expect(calcTendencia(fin, "ingresos")).toBeNull();
  });

  it("devuelve null si el dato del año anterior es null", () => {
    const fin = [
      { anio: 2024, ingresos: 100, margenBruto: null, ebitda: null },
      { anio: 2023, ingresos: null, margenBruto: null, ebitda: null },
    ];
    expect(calcTendencia(fin, "ingresos")).toBeNull();
  });

  it("devuelve null si el año anterior es 0 (evita división por cero)", () => {
    const fin = [
      { anio: 2024, ingresos: 100, margenBruto: null, ebitda: null },
      { anio: 2023, ingresos: 0, margenBruto: null, ebitda: null },
    ];
    expect(calcTendencia(fin, "ingresos")).toBeNull();
  });

  it("usa Math.abs para que negativos no inviertan el signo", () => {
    // ebitda: -50 → -25 = mejora (variación = (-25 - -50) / |−50| = 0.5 = 50%)
    const fin = [
      { anio: 2024, ingresos: 0, margenBruto: null, ebitda: -25 },
      { anio: 2023, ingresos: 0, margenBruto: null, ebitda: -50 },
    ];
    const r = calcTendencia(fin, "ebitda");
    expect(r?.direccion).toBe("up");
    expect(r?.variacionPct).toBeCloseTo(50, 5);
  });

  it("admite los 3 campos: ingresos, margenBruto, ebitda", () => {
    const fin = [
      { anio: 2024, ingresos: 100, margenBruto: 50, ebitda: 20 },
      { anio: 2023, ingresos: 80, margenBruto: 30, ebitda: 10 },
    ];
    expect(calcTendencia(fin, "ingresos")?.direccion).toBe("up");
    expect(calcTendencia(fin, "margenBruto")?.direccion).toBe("up");
    expect(calcTendencia(fin, "ebitda")?.direccion).toBe("up");
  });
});

describe("enrichFinancieros", () => {
  it("calcula margenBrutoPct y ebitdaPct cuando hay ingresos", () => {
    const result = enrichFinancieros([
      { anio: 2024, ingresos: 100, margenBruto: 30, ebitda: 15, resultadoNeto: 5 },
    ]);
    expect(result[0]).toMatchObject({
      anio: 2024,
      ingresos: 100,
      margenBruto: 30,
      margenBrutoPct: 30,
      ebitda: 15,
      ebitdaPct: 15,
      resultadoNeto: 5,
    });
  });

  it("devuelve null en los % cuando ingresos es null", () => {
    const result = enrichFinancieros([
      { anio: 2024, ingresos: null, margenBruto: 30, ebitda: 15 },
    ]);
    expect(result[0].margenBrutoPct).toBeNull();
    expect(result[0].ebitdaPct).toBeNull();
  });

  it("devuelve null en los % cuando ingresos es 0 (evita división por cero)", () => {
    const result = enrichFinancieros([
      { anio: 2024, ingresos: 0, margenBruto: 30, ebitda: 15 },
    ]);
    // Al ser 0, `f.ingresos && ...` es falsy → null.
    expect(result[0].margenBrutoPct).toBeNull();
    expect(result[0].ebitdaPct).toBeNull();
  });

  it("devuelve null en margenBrutoPct cuando margenBruto es null aunque haya ingresos", () => {
    const result = enrichFinancieros([
      { anio: 2024, ingresos: 100, margenBruto: null, ebitda: 15 },
    ]);
    expect(result[0].margenBrutoPct).toBeNull();
    expect(result[0].ebitdaPct).toBe(15);
  });

  it("conserva resultadoNeto si está, null si no", () => {
    const a = enrichFinancieros([
      { anio: 2024, ingresos: 100, margenBruto: 50, ebitda: 20, resultadoNeto: 10 },
    ]);
    expect(a[0].resultadoNeto).toBe(10);
    const b = enrichFinancieros([
      { anio: 2024, ingresos: 100, margenBruto: 50, ebitda: 20 },
    ]);
    expect(b[0].resultadoNeto).toBeNull();
  });

  it("preserva el orden de entrada", () => {
    const result = enrichFinancieros([
      { anio: 2024, ingresos: 100, margenBruto: null, ebitda: null },
      { anio: 2023, ingresos: 80, margenBruto: null, ebitda: null },
    ]);
    expect(result.map((r) => r.anio)).toEqual([2024, 2023]);
  });

  it("array vacío → array vacío", () => {
    expect(enrichFinancieros([])).toEqual([]);
  });
});
