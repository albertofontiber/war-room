import { describe, expect, it } from "vitest";
import { aIso, consolida, planificaRipci, type EmpresaBase } from "./sync";
import type { FilaRipci } from "./buscador";

function fila(nif: string, numero: string, extra: Partial<FilaRipci> = {}): FilaRipci {
  return {
    fecha: "08/08/2026", estado: "ACTIVO", titular: "EMPRESA SL",
    nif, numero, ccaa: "MADRID", seccion: numero.includes("-D") ? "D" : "E",
    ...extra,
  };
}

describe("consolida", () => {
  it("saca la categoría del número de registro, no del texto", () => {
    // 5 = rociadores, 0 = detección.
    const e = consolida([
      fila("B11111111", "09-B-DC5-00704777"),
      fila("B11111111", "09-B-DC0-00704777"),
    ]);

    expect(e[0].instalacion).toEqual([
      "Detección y alarma de incendios",
      "Rociadores automáticos y agua pulverizada",
    ]);
    expect(e[0].mantenimiento).toEqual([]);
  });

  it("separa lo que instala de lo que mantiene", () => {
    const e = consolida([
      fila("B11111111", "09-B-DC4-00704777"),
      fila("B11111111", "09-B-EC4-00704777"),
    ]);

    expect(e[0].instalacion).toEqual(["Columna seca"]);
    expect(e[0].mantenimiento).toEqual(["Columna seca"]);
  });

  it("los extintores solo cuentan como mantenimiento", () => {
    // No existen como categoría de instalador; si el registro la trajera
    // marcada así, sería un dato erróneo y se descarta.
    const e = consolida([
      fila("B11111111", "09-B-ECC-00704777"),
      fila("B11111111", "09-B-DCC-00704777"),
    ]);

    expect(e[0].mantenimiento).toEqual(["Extintores de incendios"]);
    expect(e[0].instalacion).toEqual([]);
  });

  it("se queda con la fecha de inscripción más antigua", () => {
    const e = consolida([
      fila("B11111111", "09-B-DC0-1", { fecha: "08/08/2026" }),
      fila("B11111111", "09-B-DC1-1", { fecha: "03/02/2019" }),
    ]);

    expect(e[0].desde).toBe("2019-02-03");
  });

  it("descarta empresas sin ninguna categoría reconocible", () => {
    expect(consolida([fila("B11111111", "numero-raro")])).toEqual([]);
  });
});

describe("planificaRipci", () => {
  const base: EmpresaBase[] = [
    { id: 1, cif: "B11111111", nombre: "YA ESTÁ SL", ripci: { instalacion: ["Columna seca"], mantenimiento: [] } },
    { id: 2, cif: "B22222222", nombre: "SIN CATEGORÍAS SL", ripci: null },
  ];

  it("no toca a la que ya está al día", () => {
    const plan = planificaRipci(base, [
      { nif: "B11111111", titular: "YA ESTÁ SL", ccaa: "MADRID", instalacion: ["Columna seca"], mantenimiento: [], desde: null },
    ]);
    expect(plan.actualizaciones).toEqual([]);
    expect(plan.altas).toEqual([]);
  });

  it("actualiza cuando cambian las categorías", () => {
    const plan = planificaRipci(base, [
      { nif: "B11111111", titular: "YA ESTÁ SL", ccaa: "MADRID", instalacion: ["Columna seca", "Espuma física"], mantenimiento: [], desde: null },
    ]);
    expect(plan.actualizaciones).toHaveLength(1);
    expect(plan.actualizaciones[0].id).toBe(1);
  });

  it("da de alta a la que no está", () => {
    const plan = planificaRipci(base, [
      { nif: "B99999999", titular: "NUEVA SL", ccaa: "GALICIA", instalacion: ["Columna seca"], mantenimiento: [], desde: "2026-08-01" },
    ]);
    expect(plan.altas.map((a) => a.nif)).toEqual(["B99999999"]);
  });

  it("guarda las categorías de una que estaba sin ellas", () => {
    const plan = planificaRipci(base, [
      { nif: "B22222222", titular: "SIN CATEGORÍAS SL", ccaa: "MADRID", instalacion: ["Columna seca"], mantenimiento: [], desde: null },
    ]);
    expect(plan.actualizaciones[0].id).toBe(2);
  });

  it("cruza por CIF, no por nombre", () => {
    const plan = planificaRipci(base, [
      { nif: "B77777777", titular: "YA ESTÁ SL", ccaa: "MADRID", instalacion: ["Columna seca"], mantenimiento: [], desde: null },
    ]);
    expect(plan.actualizaciones).toEqual([]);
    expect(plan.altas).toHaveLength(1);
  });
});

describe("aIso", () => {
  it("convierte la fecha del buscador", () => {
    expect(aIso("03/02/2019")).toBe("2019-02-03");
    expect(aIso("vaya")).toBeNull();
  });
});
