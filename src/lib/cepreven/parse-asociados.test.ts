import { describe, expect, it } from "vitest";
import { parseAsociados } from "./parse-asociados";

/** Reproduce el marcado real de una tarjeta del listado. */
function tarjeta(
  tipo: "normal" | "premium",
  slug: string,
  nombre: string,
  poblacion: string
): string {
  return `
  <div class="col-lg-4 col-md-6 col-sm-6 col-xs-12 miembro-${tipo}">
    <a href="https://www.cepreven.com/asociados/listado/${slug}">
      <div class="foto"><img src="/fotos/miembros/logo1.gif" ></div>
      <div class="info">
        <div class="nombre">${nombre}</div>
        <div class="poblacion">
          ${poblacion}        </div>
      </div>
      <div class="boton-info">+ Info</div>
    </a>
  </div>`;
}

describe("parseAsociados", () => {
  it("extrae nombre, población y ficha de cada tarjeta", () => {
    const html = tarjeta(
      "normal",
      "3F-Ingenieria-Mantenimiento-Sl",
      "3F Ingeniería Mantenimiento, S.L.",
      "MADRID"
    );

    expect(parseAsociados(html)).toEqual([
      {
        nombre: "3F Ingeniería Mantenimiento, S.L.",
        poblacion: "MADRID",
        url: "https://www.cepreven.com/asociados/listado/3F-Ingenieria-Mantenimiento-Sl",
        institucional: false,
      },
    ]);
  });

  it("marca como institucionales a los miembros premium", () => {
    const html =
      tarjeta("premium", "Unespa", "UNESPA", "MADRID") +
      tarjeta("normal", "Suris-Sl", "SURIS, S.L.", "BARCELONA");

    const out = parseAsociados(html);
    expect(out.map((e) => [e.nombre, e.institucional])).toEqual([
      ["UNESPA", true],
      ["SURIS, S.L.", false],
    ]);
  });

  it("conserva la provincia cuando la población la incluye", () => {
    const html = tarjeta(
      "normal",
      "9Teknic",
      "9TEKNIC GRUP SISTEMES DE SEGURETAT, S.L.",
      "TORDERA - BARCELONA"
    );

    expect(parseAsociados(html)[0].poblacion).toBe("TORDERA - BARCELONA");
  });

  it("resuelve entidades HTML del nombre", () => {
    const html = tarjeta("normal", "X", "FUEGO &amp; SEGURIDAD, S.L.", "MADRID");

    expect(parseAsociados(html)[0].nombre).toBe("FUEGO & SEGURIDAD, S.L.");
  });

  it("no repite una empresa que aparezca en dos bloques", () => {
    // Los premium se listan arriba destacados y otra vez en el listado general.
    const html =
      tarjeta("premium", "Urbaser", "URBASER, S.A.", "Madrid") +
      tarjeta("premium", "Urbaser", "URBASER, S.A.", "Madrid");

    expect(parseAsociados(html)).toHaveLength(1);
  });

  it("devuelve una lista vacía si cambia el marcado", () => {
    // Fallo ruidoso: el cron avisa al ver 0 empresas en vez de escribir basura.
    expect(parseAsociados("<div class='tarjeta'><h3>SURIS</h3></div>")).toEqual([]);
  });

  it("ignora tarjetas sin nombre", () => {
    expect(parseAsociados(tarjeta("normal", "X", "  ", "MADRID"))).toEqual([]);
  });
});
