import { describe, expect, it } from "vitest";
import { componeAviso } from "./aviso";
import type { ResultadoRegistro } from "./tipos";

function registro(p: Partial<ResultadoRegistro> = {}): ResultadoRegistro {
  return { registro: "RIPCI", altas: [], actualizadas: 0, avisos: [], resumen: {}, ...p };
}

describe("componeAviso", () => {
  it("no avisa cuando no hay nada que contar", () => {
    expect(componeAviso([registro(), registro({ registro: "Cepreven", actualizadas: 40 })])).toBeNull();
  });

  it("separa las calificadas de las asociadas de Cepreven", () => {
    // Son cosas distintas: la calificación implica haber pasado la auditoría.
    const aviso = componeAviso([
      registro({
        registro: "Cepreven",
        altas: [
          { nombre: "IBEREXT", cif: "", grupo: "Calificadas", detalle: "18 áreas: …" },
          { nombre: "SURIS", cif: "", grupo: "Asociadas", detalle: "miembro de la asociación" },
        ],
      }),
    ])!;

    expect(aviso.mensaje).toContain("Cepreven · Calificadas — 1 empresa");
    expect(aviso.mensaje).toContain("Cepreven · Asociadas — 1 empresa");
    // Cada una bajo su bloque, no mezcladas.
    const iCal = aviso.mensaje.indexOf("Calificadas");
    const iSuris = aviso.mensaje.indexOf("SURIS");
    expect(aviso.mensaje.indexOf("IBEREXT")).toBeGreaterThan(iCal);
    expect(iSuris).toBeGreaterThan(aviso.mensaje.indexOf("Asociadas"));
  });

  it("agrupa por registro cuando no hay subgrupo", () => {
    const aviso = componeAviso([
      registro({ altas: [{ nombre: "NUEVA SL", cif: "B1", detalle: "13 categorías" }] }),
    ])!;

    expect(aviso.mensaje).toContain("RIPCI — 1 empresa");
    expect(aviso.mensaje).toContain("· NUEVA SL (B1) — 13 categorías");
  });

  it("cuenta todas las altas en el título", () => {
    const aviso = componeAviso([
      registro({ altas: [{ nombre: "A", cif: "", detalle: "" }] }),
      registro({ registro: "Seguridad privada", altas: [{ nombre: "B", cif: "", detalle: "" }] }),
    ])!;

    expect(aviso.titulo).toContain("2 empresas nuevas");
  });

  it("avisa aunque solo haya incidencias", () => {
    const aviso = componeAviso([registro({ avisos: ["RIPCI — 2 ya no figuran"] })])!;

    expect(aviso.titulo).toContain("algo que revisar");
    expect(aviso.mensaje).toContain("⚠️ RIPCI — 2 ya no figuran");
  });

  it("reporta una fuente ilegible sin dar por hecho que se tocó nada", () => {
    const aviso = componeAviso([
      registro({ registro: "Cepreven", ilegible: "El PDF vino vacío." }),
    ])!;

    expect(aviso.mensaje).toContain("Cepreven: El PDF vino vacío.");
    expect(aviso.mensaje).toContain("No se ha modificado ninguna empresa");
  });

  it("incluye los fallos de sincronización", () => {
    const aviso = componeAviso([registro()], ["Cepreven: HTTP 503"])!;
    expect(aviso.mensaje).toContain("❌ Falló la sincronización de Cepreven: HTTP 503");
  });

  it("menciona las actualizaciones de rutina solo como pie", () => {
    const aviso = componeAviso([
      registro({ altas: [{ nombre: "A", cif: "", detalle: "x" }], actualizadas: 12 }),
    ])!;

    expect(aviso.mensaje).toContain("(12 fichas actualizadas sin más cambios)");
  });
});
