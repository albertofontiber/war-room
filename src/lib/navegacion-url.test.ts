import { describe, expect, it } from "vitest";
import { VISTAS, VISTA_POR_DEFECTO, hrefVista, leerVista } from "./navegacion-url";

/** Lo que haría el War Room al abrir el enlace: ruta + vista leída de la URL. */
function abrir(href: string) {
  const url = new URL(href, "https://warroom.fontiber.com");
  return { ruta: url.pathname, vista: leerVista(url.searchParams) };
}

describe("hrefVista", () => {
  it.each(VISTAS)("el enlace a %s abre esa vista en la portada", (vista) => {
    expect(abrir(hrefVista(vista))).toEqual({ ruta: "/", vista });
  });

  it("operaciones es un parámetro de `/`, no una ruta propia", () => {
    expect(hrefVista("operaciones")).toBe("/?vista=operaciones");
  });

  it("la vista por defecto queda en `/` sin parámetros", () => {
    expect(hrefVista(VISTA_POR_DEFECTO)).toBe("/");
  });
});

describe("leerVista", () => {
  it("sin parámetro o con un valor desconocido cae en la vista por defecto", () => {
    expect(leerVista(new URLSearchParams())).toBe(VISTA_POR_DEFECTO);
    expect(leerVista(new URLSearchParams("vista=operacion"))).toBe(VISTA_POR_DEFECTO);
  });

  it("conserva la vista aunque haya otros parámetros", () => {
    expect(leerVista(new URLSearchParams("vista=tabla&empresa=12"))).toBe("tabla");
  });
});
