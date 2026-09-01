import { describe, expect, it } from "vitest";
import { planificaHabilitaciones, type EmpresaBase } from "./sync";

const base: EmpresaBase[] = [
  { id: 1, cif: "B11111111", nombre: "INSTALADORA SL", sector: "seguridad_electronica", habilitaciones: null, ambitoGeo: null },
  { id: 2, cif: "B22222222", nombre: "YA AL DIA SL", sector: "seguridad_electronica", habilitaciones: { INS: "A" }, ambitoGeo: "A", registroFuente: "policia" },
  { id: 3, cif: "B33333333", nombre: "HETECSE SA", sector: "PCI", habilitaciones: null, ambitoGeo: null },
];

describe("planificaHabilitaciones", () => {
  it("guarda el desglose de una empresa que no lo tenía", () => {
    const plan = planificaHabilitaciones(base, [
      { registro: "policia", empresas: [{ nombre: "INSTALADORA SL", cif: "B11111111", habilitaciones: { INS: "A", CA: "E" } }] },
    ]);

    expect(plan.actualizaciones).toEqual([
      {
        id: 1,
        nombre: "INSTALADORA SL",
        habilitaciones: { INS: "A", CA: "E" },
        ambitoGeo: "A",
        registroFuente: "policia",
        antes: {},
      },
    ]);
  });

  it("no toca una empresa que ya está al día", () => {
    const plan = planificaHabilitaciones(base, [
      { registro: "policia", empresas: [{ nombre: "YA AL DIA SL", cif: "B22222222", habilitaciones: { INS: "A" } }] },
    ]);

    expect(plan.actualizaciones).toEqual([]);
  });

  it("mantiene ambitoGeo en sintonía con la habilitación de instalación", () => {
    const plan = planificaHabilitaciones(base, [
      { registro: "policia", empresas: [{ nombre: "YA AL DIA SL", cif: "B22222222", habilitaciones: { INS: "E" } }] },
    ]);

    expect(plan.actualizaciones[0].ambitoGeo).toBe("E");
  });

  it("da de alta a una instaladora que no estaba", () => {
    const plan = planificaHabilitaciones(base, [
      { registro: "catalunya", empresas: [{ nombre: "NUEVA SL", cif: "B99999999", habilitaciones: { INS: "A" } }] },
    ]);

    expect(plan.altas).toEqual([
      { nombre: "NUEVA SL", cif: "B99999999", habilitaciones: { INS: "A" }, ambitoGeo: "A", registroFuente: "catalunya" },
    ]);
  });

  it("descarta las altas sin habilitación de instalación", () => {
    // Regla de Alberto: el universo son instaladoras, no vigilancia ni
    // transporte de fondos.
    const plan = planificaHabilitaciones(base, [
      { registro: "policia", empresas: [{ nombre: "SOLO VIGILANCIA SL", cif: "B88888888", habilitaciones: { VJ: "E", DE: "E" } }] },
    ]);

    expect(plan.altas).toEqual([]);
    expect(plan.descartadasSinInstalacion).toBe(1);
  });

  it("sí actualiza a una que ya está en la base aunque pierda la instalación", () => {
    // La excepción de PCI: si ya tiene ficha, se le guarda el desglose aunque
    // no instale.
    const plan = planificaHabilitaciones(base, [
      { registro: "policia", empresas: [{ nombre: "HETECSE SA", cif: "B33333333", habilitaciones: { VJ: "E" } }] },
    ]);

    expect(plan.actualizaciones).toHaveLength(1);
    expect(plan.actualizaciones[0].ambitoGeo).toBeNull();
    expect(plan.descartadasSinInstalacion).toBe(0);
  });

  it("funde las habilitaciones de una empresa que sale en dos registros", () => {
    const plan = planificaHabilitaciones(base, [
      { registro: "policia", empresas: [{ nombre: "INSTALADORA SL", cif: "B11111111", habilitaciones: { INS: "E" } }] },
      { registro: "catalunya", empresas: [{ nombre: "INSTALADORA SL", cif: "B11111111", habilitaciones: { VJ: "A" } }] },
    ]);

    expect(plan.actualizaciones[0].habilitaciones).toEqual({ INS: "E", VJ: "A" });
  });

  it("al fundir, el ámbito estatal gana al autonómico", () => {
    // Estar inscrita además en un registro autonómico no le quita a una
    // empresa el alcance estatal que ya tenía.
    const plan = planificaHabilitaciones(base, [
      { registro: "policia", empresas: [{ nombre: "INSTALADORA SL", cif: "B11111111", habilitaciones: { INS: "E" } }] },
      { registro: "catalunya", empresas: [{ nombre: "INSTALADORA SL", cif: "B11111111", habilitaciones: { INS: "A" } }] },
    ]);

    expect(plan.actualizaciones[0].habilitaciones).toEqual({ INS: "E" });
    expect(plan.actualizaciones[0].ambitoGeo).toBe("E");
  });

  it("reporta sin tocarlas las que ya no figuran en su registro", () => {
    const plan = planificaHabilitaciones(base, [{ registro: "policia", empresas: [] }]);

    expect(plan.sinRespaldo).toEqual([{ id: 2, nombre: "YA AL DIA SL" }]);
    expect(plan.actualizaciones).toEqual([]);
  });

  it("no da por desaparecida a una empresa cuyo registro no se ha leído", () => {
    // El listado nacional solo se republica dos o tres veces al año: los meses
    // que no hay edición nueva no se lee, y eso no dice nada de las mil y pico
    // empresas que salieron de él.
    const plan = planificaHabilitaciones(base, [{ registro: "catalunya", empresas: [] }]);

    expect(plan.sinRespaldo).toEqual([]);
  });

  it("de las empresas sin registro de origen solo opina si ha leído los tres", () => {
    const sinOrigen: EmpresaBase[] = [
      { id: 9, cif: "B99999999", nombre: "VIEJA SL", sector: "PCI", habilitaciones: { INS: "A" }, ambitoGeo: "A" },
    ];

    expect(
      planificaHabilitaciones(sinOrigen, [
        { registro: "policia", empresas: [] },
        { registro: "catalunya", empresas: [] },
      ]).sinRespaldo
    ).toEqual([]);

    expect(
      planificaHabilitaciones(sinOrigen, [
        { registro: "policia", empresas: [] },
        { registro: "catalunya", empresas: [] },
        { registro: "euskadi", empresas: [] },
      ]).sinRespaldo
    ).toEqual([{ id: 9, nombre: "VIEJA SL" }]);
  });

  it("cruza solo por CIF, nunca por nombre", () => {
    // Mismo nombre, CIF distinto: es otra empresa y va como alta.
    const plan = planificaHabilitaciones(base, [
      { registro: "policia", empresas: [{ nombre: "INSTALADORA SL", cif: "B77777777", habilitaciones: { INS: "A" } }] },
    ]);

    expect(plan.actualizaciones).toEqual([]);
    expect(plan.altas.map((a) => a.cif)).toEqual(["B77777777"]);
  });
});
