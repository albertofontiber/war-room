import { describe, expect, it, vi } from "vitest";
import { candidatos, localizaListado } from "./localiza-listado";

describe("candidatos", () => {
  it("genera las variantes de nombre vistas en ediciones reales", () => {
    const nombres = candidatos(new Date(Date.UTC(2026, 1, 9)));

    // La edición vigente cuando se escribió esto.
    expect(nombres).toContain("empresas_inscritas_09_02_26.pdf");
    // Año a cuatro dígitos, como en la de septiembre de 2025.
    expect(nombres).toContain("empresas_inscritas_09_02_2026.pdf");
    // Separada por espacios, como la de julio de 2024.
    expect(nombres).toContain("empresas_inscritas_09 02 2026.pdf");
    // Prefijo antiguo.
    expect(nombres).toContain("empresas_seguridad_09_02_26.pdf");
  });

  it("rellena con ceros los días y meses de un dígito", () => {
    const nombres = candidatos(new Date(Date.UTC(2026, 0, 5)));
    expect(nombres[0]).toBe("empresas_inscritas_05_01_26.pdf");
  });
});

describe("localizaListado", () => {
  const hoy = new Date(Date.UTC(2026, 1, 20));

  it("devuelve la edición más reciente que responde", async () => {
    const head = vi.fn(async (url: string) =>
      url.includes("empresas_inscritas_09_02_26.pdf")
    );

    const hallado = await localizaListado(hoy, 30, head);

    expect(hallado?.url).toContain("empresas_inscritas_09_02_26.pdf");
    expect(hallado?.fecha.toISOString().slice(0, 10)).toBe("2026-02-09");
  });

  it("prefiere la más nueva cuando hay varias publicadas", async () => {
    // Las ediciones antiguas siguen online, así que hay que parar en la
    // primera que responda yendo hacia atrás, no seguir buscando.
    const head = vi.fn(
      async (url: string) =>
        url.includes("_09_02_26.pdf") || url.includes("_15_02_26.pdf")
    );

    const hallado = await localizaListado(hoy, 30, head);

    expect(hallado?.url).toContain("_15_02_26.pdf");
  });

  it("devuelve null si no encuentra ninguna en la ventana", async () => {
    const head = vi.fn(async () => false);

    expect(await localizaListado(hoy, 5, head)).toBeNull();
  });

  it("para en cuanto la encuentra, sin barrer la ventana entera", async () => {
    const head = vi.fn(async (url: string) => url.includes("_20_02_26.pdf"));

    await localizaListado(hoy, 120, head);

    // Se sondea por tandas de 3 días, así que se prueban esos 3 y se para:
    // muy lejos de los 120 días × 6 candidatos que tiene la ventana.
    expect(head.mock.calls.length).toBeLessThanOrEqual(18);
  });

  it("dentro de una tanda se queda con la fecha más reciente", async () => {
    // Dos ediciones dentro de la misma tanda de 3 días: gana la nueva.
    const head = vi.fn(
      async (url: string) =>
        url.includes("_19_02_26.pdf") || url.includes("_18_02_26.pdf")
    );

    const hallado = await localizaListado(hoy, 30, head);

    expect(hallado?.url).toContain("_19_02_26.pdf");
  });
});
