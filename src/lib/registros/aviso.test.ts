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

describe("componeAviso · correo en tablas", () => {
  it("saca una fila por empresa, con su zona en columna propia", () => {
    const aviso = componeAviso([
      registro({
        altas: [
          { nombre: "CARAILA 21 S.L", cif: "B42839415", zona: "ANDALUCÍA", detalle: "3 de instalación" },
          { nombre: "SUBER CLIMATIZACION SL", cif: "B71537781", zona: "NAVARRA", detalle: "13 de instalación" },
        ],
      }),
    ])!;

    expect(aviso.html).toContain("<th");
    expect(aviso.html).toContain("Zona");
    expect(aviso.html).toContain("B42839415");
    expect(aviso.html).toContain("NAVARRA");
    expect((aviso.html.match(/<tr>/g) ?? []).length).toBe(3); // cabecera + 2
  });

  it("no pinta la columna del CIF cuando el registro no lo publica", () => {
    // Cepreven da razón social pero no CIF: una columna de guiones no aporta.
    const aviso = componeAviso([
      registro({
        registro: "Cepreven",
        altas: [{ nombre: "AIR FEU, S.L.", cif: "", grupo: "Calificadas", detalle: "1 área: DAI" }],
      }),
    ])!;

    expect(aviso.html).toContain("Cepreven · Calificadas — 1 empresa");
    expect(aviso.html).not.toContain(">CIF<");
    expect(aviso.html).not.toContain(">Zona<");
  });

  it("separa lo que hay que revisar de lo que no se pudo sincronizar", () => {
    const aviso = componeAviso(
      [registro({ avisos: ["RIPCI — 2 ya no figuran"] })],
      ["Cepreven: HTTP 503"]
    )!;

    expect(aviso.html).toContain("Para revisar a mano");
    expect(aviso.html).toContain("RIPCI — 2 ya no figuran");
    expect(aviso.html).toContain("No se pudo sincronizar");
    expect(aviso.html).toContain("Falló la sincronización de Cepreven: HTTP 503");
  });

  it("escapa las razones sociales antes de meterlas en el HTML", () => {
    const aviso = componeAviso([
      registro({ altas: [{ nombre: "A & B <SL>", cif: "B1", detalle: "x" }] }),
    ])!;

    expect(aviso.html).toContain("A &amp; B &lt;SL&gt;");
    expect(aviso.html).not.toContain("<SL>");
  });

  it("mantiene la zona en el texto plano de la campanita", () => {
    // La campanita no lleva tabla, así que la zona tiene que seguir dentro
    // de la línea o se pierde.
    const aviso = componeAviso([
      registro({ altas: [{ nombre: "NUEVA SL", cif: "B1", zona: "MADRID", detalle: "13 categorías" }] }),
    ])!;

    expect(aviso.mensaje).toContain("· NUEVA SL (B1) — 13 categorías · MADRID");
  });
});
