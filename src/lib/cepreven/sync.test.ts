import { describe, expect, it } from "vitest";
import { escriturasSeguras, planificaSync, type EmpresaEstado } from "./sync";
import type { EmpresaAsociada } from "./parse-asociados";

const base: EmpresaEstado[] = [
  { id: 1, cif: "B1", nombre: "SURIS SL", cepreven: null, ceprevenAreas: null },
  { id: 2, cif: "B2", nombre: "EXTINIRUÑA SL", cepreven: "asociada", ceprevenAreas: null },
  { id: 3, cif: "B3", nombre: "IBEREXT, S.A.", cepreven: "calificada", ceprevenAreas: '["DAI"]' },
  { id: 4, cif: "B4", nombre: "DEMCO MONTAJES SL", cepreven: "calificada", ceprevenAreas: null },
  { id: 5, cif: "B5", nombre: "AJENA SL", cepreven: null, ceprevenAreas: null },
];

const asociada = (nombre: string, institucional = false): EmpresaAsociada => ({
  nombre,
  poblacion: "MADRID",
  url: "",
  institucional,
});

describe("planificaSync", () => {
  it("da de alta una empresa nueva con sus áreas", () => {
    const plan = planificaSync(base, [{ nombre: "SURIS, S.L.", areas: ["DAI", "EAA-RO"] }], []);

    expect(plan.altas).toEqual([
      { id: 1, nombre: "SURIS SL", cepreven: "calificada", ceprevenAreas: '["DAI","EAA-RO"]' },
    ]);
  });

  it("sube de asociada a calificada, porque es rango superior", () => {
    const plan = planificaSync(
      base,
      [{ nombre: "EXTINIRUÑA, S.L.", areas: ["MANT-DAI"] }],
      [asociada("EXTINIRUÑA, S.L.")]
    );

    expect(plan.cambios).toEqual([
      { id: 2, nombre: "EXTINIRUÑA SL", cepreven: "calificada", ceprevenAreas: '["MANT-DAI"]' },
    ]);
    expect(plan.degradaciones).toEqual([]);
  });

  it("no toca una empresa que ya está como debe", () => {
    const plan = planificaSync(base, [{ nombre: "IBEREXT, S.A.", areas: ["DAI"] }], []);

    expect(plan.altas).toEqual([]);
    expect(plan.cambios).toEqual([]);
  });

  it("acumula las áreas de una empresa que el listado trae dos veces", () => {
    const plan = planificaSync(
      base,
      [
        { nombre: "SURIS, S.L.", areas: ["DAI"] },
        { nombre: "SURIS SL", areas: ["EAA-RO"] },
      ],
      []
    );

    expect(plan.altas[0].ceprevenAreas).toBe('["DAI","EAA-RO"]');
  });

  it("aparta la degradación de calificada a asociada en vez de aplicarla", () => {
    // IBEREXT sale del listado de calificadas pero sigue en el de asociadas:
    // lo normal es que el cruce de calificadas haya fallado.
    const plan = planificaSync(base, [], [asociada("IBEREXT, S.A.")]);

    expect(plan.degradaciones).toEqual([{ id: 3, nombre: "IBEREXT, S.A." }]);
    expect(escriturasSeguras(plan)).toEqual([]);
  });

  it("aparta las bajas y no las cuenta como escrituras seguras", () => {
    const plan = planificaSync(base, [], []);

    expect(plan.bajas.map((b) => b.nombre).sort()).toEqual([
      "DEMCO MONTAJES SL",
      "EXTINIRUÑA SL",
      "IBEREXT, S.A.",
    ]);
    expect(escriturasSeguras(plan)).toEqual([]);
  });

  it("descarta los miembros institucionales del listado de asociadas", () => {
    const plan = planificaSync(base, [], [asociada("AJENA, S.L.", true)]);

    expect(plan.altas).toEqual([]);
  });

  it("reporta lo que no casa con ninguna empresa", () => {
    const plan = planificaSync(
      base,
      [{ nombre: "EMPRESA FANTASMA, S.L.", areas: ["DAI"] }],
      [asociada("OTRA FANTASMA, S.L.")]
    );

    expect(plan.sinCasar.calificadas).toEqual(["EMPRESA FANTASMA, S.L."]);
    expect(plan.sinCasar.asociadas).toEqual(["OTRA FANTASMA, S.L."]);
  });

  it("marca como asociada a la que solo está en ese listado", () => {
    const plan = planificaSync(base, [], [asociada("AJENA, S.L.")]);

    expect(plan.altas).toEqual([
      { id: 5, nombre: "AJENA SL", cepreven: "asociada", ceprevenAreas: null },
    ]);
  });
});
