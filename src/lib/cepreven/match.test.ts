import { describe, expect, it } from "vitest";
import { cruza, normalizaNombre, type EmpresaBase } from "./match";

describe("normalizaNombre", () => {
  it("iguala las variantes de la forma jurídica", () => {
    // El caso que hacía fallar el cruce: "S.L." se convierte en "S L" al
    // quitar la puntuación, y sin volver a pegar las letras no se reconocía
    // como forma jurídica.
    const esperado = "AIR FEU";
    for (const v of ["AIR FEU, S.L.", "AIR FEU SL", "Air Feu, s.l.", "AIR FEU S.L"]) {
      expect(normalizaNombre(v)).toBe(esperado);
    }
  });

  it("recorta formas jurídicas encadenadas", () => {
    expect(normalizaNombre("PEFIPRESA, S.A.U.")).toBe("PEFIPRESA");
    expect(normalizaNombre("BIFAN IBÉRICA, S.L.U.")).toBe("BIFAN IBERICA");
    expect(normalizaNombre("ONDOAN, S. COOP.")).toBe("ONDOAN");
  });

  it("no recorta un nombre que acaba en las mismas letras", () => {
    // "PACISA" acaba en "SA" pero no es una forma jurídica: sin el límite de
    // palabra quedaría en "PACI".
    expect(normalizaNombre("PACISA")).toBe("PACISA");
    expect(normalizaNombre("TELESA")).toBe("TELESA");
  });

  it("quita acentos y puntuación", () => {
    expect(normalizaNombre("EXTINIRUÑA, S.L.")).toBe("EXTINIRUNA");
    expect(normalizaNombre("COTTES Fire & Smoke Solutions, S.L")).toBe(
      "COTTES FIRE SMOKE SOLUTIONS"
    );
  });
});

describe("cruza", () => {
  const base: EmpresaBase[] = [
    { id: 1, cif: "B96659438", nombre: "AIR FEU SL" },
    { id: 2, cif: "A45407525", nombre: "CALIDAD Y VERIFICACION EN INSTALACIONES, S.A." },
    { id: 3, cif: "B11111111", nombre: "SURIS SL" },
    { id: 4, cif: "B22222222", nombre: "DUPLICADA SL" },
    { id: 5, cif: "B33333333", nombre: "Duplicada, S.L." },
    { id: 6, cif: "B20646717", nombre: "EXTI NORTE, S.L." },
  ];

  it("casa por nombre normalizado", () => {
    const r = cruza([{ nombre: "SURIS, S.L." }], base, (e) => e.nombre);
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0].empresa.id).toBe(3);
    expect(r.casados[0].via).toBe("nombre");
  });

  it("casa por alias cuando la marca comercial no se parece a la razón social", () => {
    const r = cruza([{ nombre: "CV INSTALACIONES, S.L." }], base, (e) => e.nombre);
    expect(r.casados[0].empresa.id).toBe(2);
    expect(r.casados[0].via).toBe("alias");
  });

  it("casa por alias cuando la única diferencia es un espacio", () => {
    // Cepreven la escribe "EXTINORTE, S.L." y la base "EXTI NORTE, S.L.".
    // Sin el alias el cruce la daba por salida de la asociación cada mes.
    const r = cruza([{ nombre: "EXTINORTE, S.L." }], base, (e) => e.nombre);
    expect(r.casados[0].empresa.id).toBe(6);
    expect(r.casados[0].via).toBe("alias");
    expect(r.sinCasar).toHaveLength(0);
  });

  it("deja sin casar lo que no encuentra, en vez de aproximar", () => {
    const r = cruza([{ nombre: "EMPRESA QUE NO EXISTE, S.L." }], base, (e) => e.nombre);
    expect(r.casados).toHaveLength(0);
    expect(r.sinCasar).toHaveLength(1);
  });

  it("deja sin casar un nombre ambiguo en vez de elegir al azar", () => {
    const r = cruza([{ nombre: "DUPLICADA, S.L." }], base, (e) => e.nombre);
    expect(r.casados).toHaveLength(0);
    expect(r.sinCasar).toHaveLength(1);
  });
});
