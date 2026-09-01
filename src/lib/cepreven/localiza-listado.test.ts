import { describe, expect, it } from "vitest";
import { enlaceListado } from "./localiza-listado";

const PDF = "https://www.cepreven.com/docpublicaciones/calificacion/Listado CALIFICACIÓN 62 20260720.pdf";
const ESPERADA =
  "https://www.cepreven.com/docpublicaciones/calificacion/Listado%20CALIFICACI%C3%93N%2062%2020260720.pdf";

describe("enlaceListado", () => {
  it("encuentra el enlace escrito sin espacio", () => {
    expect(enlaceListado(`<a href="${PDF}" target="_blank">`)).toBe(ESPERADA);
  });

  it("encuentra el enlace escrito con espacio antes del igual", () => {
    // La grafía con la que Cepreven rompió el cron de septiembre de 2026.
    expect(enlaceListado(`<a href ="${PDF}" target="_blank">`)).toBe(ESPERADA);
  });

  it("acepta comillas simples", () => {
    expect(enlaceListado(`<a href='${PDF}'>`)).toBe(ESPERADA);
  });

  it("ignora el visor de Google que repite la misma URL en un src", () => {
    // La página lleva comentado un iframe de docs.google.com/gview con el PDF
    // dentro del query string: no es un enlace de descarga.
    const html = `<!-- <iframe src="https://docs.google.com/gview?url=${PDF}&embedded=true"></iframe> -->`;
    expect(enlaceListado(html)).toBeNull();
  });

  it("devuelve null cuando la página ya no lleva el listado", () => {
    expect(enlaceListado(`<a href="/Listados-anteriores2.html">Listados anteriores</a>`)).toBeNull();
  });
});
