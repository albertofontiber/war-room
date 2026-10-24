import { describe, expect, it } from "vitest";
import { ACTIVIDADES_EMPRESA, cumpleFiltroActividades, obtenerActividades, parseActividades, textoActividades } from "./actividades";

describe("clasificación de actividades", () => {
  it("conserva activa en PCI previo y descompone mixto en activa y electrónica", () => {
    expect(obtenerActividades({ sector: "PCI", fuente: "ripci" })).toEqual(["pci_activa"]);
    expect(obtenerActividades({ sector: "PCI", fuente: "excel", proteccionPasiva: true })).toEqual(["pci_activa", "pci_pasiva"]);
    expect(obtenerActividades({ sector: "mixto", proteccionPasiva: true })).toEqual([...ACTIVIDADES_EMPRESA]);
    expect(obtenerActividades({ sector: "seguridad_electronica" })).toEqual(["seguridad_electronica"]);
  });
  it("no convierte las nuevas aplicadoras de pasiva en activa por su sector de compatibilidad", () => {
    const e = { sector: "PCI", fuente: "investigacion_pasiva_202610", proteccionPasiva: true };
    expect(obtenerActividades(e)).toEqual(["pci_pasiva"]);
    expect(obtenerActividades({ ...e, ripci: { instalacion: ["texto inventado"] } })).toEqual(["pci_pasiva"]);
    expect(obtenerActividades({ ...e, ripci: { mantenimiento: ["Extintores de incendios"] } })).toEqual(["pci_activa", "pci_pasiva"]);
  });
  it("admite un RIPCI válido aunque el sector previo fuera solo electrónica", () => {
    expect(obtenerActividades({ sector: "seguridad_electronica", ripci: { instalacion: ["Hidrantes exteriores"] } })).toEqual(["pci_activa", "seguridad_electronica"]);
  });
  it("pasiva requiere confirmación expresa; null y false no generan esa actividad", () => {
    expect(obtenerActividades({ proteccionPasiva: null })).toEqual([]);
    expect(obtenerActividades({ proteccionPasiva: false })).toEqual([]);
  });
});

describe("selección de actividades", () => {
  it("distingue intersección y unión para todas las combinaciones de tres actividades", () => {
    const combinaciones = Array.from({ length: 8 }, (_, mask) => ACTIVIDADES_EMPRESA.filter((_, i) => mask & (1 << i)));
    for (const empresa of combinaciones) for (const seleccion of combinaciones) {
      expect(cumpleFiltroActividades(empresa, seleccion, "todas")).toBe(seleccion.every((a) => empresa.includes(a)));
      expect(cumpleFiltroActividades(empresa, seleccion, "cualquiera")).toBe(!seleccion.length || seleccion.some((a) => empresa.includes(a)));
    }
  });
  it("tolera serialización de Mapbox, deduplica y descarta actividades desconocidas", () => {
    expect(parseActividades('["pci_pasiva","pci_pasiva","mixto"]')).toEqual(["pci_pasiva"]);
    expect(parseActividades("JSON roto")).toEqual([]);
    expect(textoActividades(ACTIVIDADES_EMPRESA)).toBe("PCI activa · PCI pasiva · Seguridad electrónica");
  });
  it("no incluye empresas sin actividad conocida al exigir una", () => {
    expect(cumpleFiltroActividades(undefined, ["pci_activa"])).toBe(false);
    expect(cumpleFiltroActividades(null, [])).toBe(true);
  });
});
