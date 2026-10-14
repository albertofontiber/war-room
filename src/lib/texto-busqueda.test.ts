import { describe, expect, it } from "vitest";
import {
  ACENTOS_DESDE,
  ACENTOS_HASTA,
  fragmento,
  normalizarTexto,
  patronInicioPalabra,
  terminosBusqueda,
} from "./texto-busqueda";

describe("normalizarTexto", () => {
  it("quita tildes y mayúsculas sin cambiar la longitud", () => {
    expect(normalizarTexto("Extinción AÑO Pingüino")).toBe("extincion ano pinguino");
    const s = "İstanbul — ÁÉÍÓÚ 🔥";
    expect(normalizarTexto(s).length).toBe(s.length);
  });

  it("la tabla de tildes del SQL y la de JS tienen la misma longitud", () => {
    expect(ACENTOS_DESDE.length).toBe(ACENTOS_HASTA.length);
  });
});

describe("terminosBusqueda", () => {
  it("parte por espacios, normaliza y deduplica", () => {
    expect(terminosBusqueda("NDA  Tesein nda")).toEqual(["nda", "tesein"]);
  });

  it("las comillas agrupan frases", () => {
    expect(terminosBusqueda('"Carta de Intenciones" tesein')).toEqual(["carta de intenciones", "tesein"]);
  });

  it("descarta términos de 1 carácter", () => {
    expect(terminosBusqueda("a y earn-out")).toEqual(["earn-out"]);
  });
});

describe("patronInicioPalabra", () => {
  it("antepone \\m y escapa metacaracteres de regex", () => {
    expect(patronInicioPalabra("nda")).toBe("\\mnda");
    expect(patronInicioPalabra("s.l. (grupo)")).toBe("\\ms\\.l\\. \\(grupo\\)");
  });
});

describe("fragmento", () => {
  const largo = `${"x ".repeat(200)}Hablamos del earn-out con el fundador ${"y ".repeat(200)}`;

  it("recorta alrededor de la coincidencia con elipsis", () => {
    const f = fragmento(largo, ["earn-out"], 20);
    expect(f.startsWith("…")).toBe(true);
    expect(f.endsWith("…")).toBe(true);
    expect(f).toContain("earn-out");
  });

  it("busca sin tildes pero devuelve el texto original", () => {
    expect(fragmento("Revisión de la Extinción", ["extincion"])).toBe("Revisión de la Extinción");
  });

  it("solo casa al inicio de palabra, como el SQL", () => {
    const f = fragmento(`segunda vez ${"z ".repeat(100)}firmado el NDA ayer`, ["nda"], 10);
    expect(f).toContain("NDA");
    expect(f).not.toContain("segunda");
  });

  it("sin coincidencia devuelve el principio del texto", () => {
    expect(fragmento("hola mundo", ["zzz"])).toBe("hola mundo");
  });
});
