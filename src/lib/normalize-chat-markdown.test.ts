import { describe, it, expect } from "vitest";
import { normalizeChatMarkdown } from "./normalize-chat-markdown";

describe("normalizeChatMarkdown", () => {
  it("devuelve texto vacío sin cambios", () => {
    expect(normalizeChatMarkdown("")).toBe("");
  });

  it("no toca texto sin tablas ni headings", () => {
    const text = "Hola, esto es un párrafo sencillo sin formato especial.";
    expect(normalizeChatMarkdown(text)).toBe(text);
  });

  it("no toca una tabla ya bien formateada (idempotente)", () => {
    const text = [
      "| Col1 | Col2 |",
      "|------|------|",
      "| a    | b    |",
      "| c    | d    |",
    ].join("\n");
    const out = normalizeChatMarkdown(text);
    // El parser puede normalizar espacios — comprobamos que las 4 filas
    // siguen estando en líneas separadas y el separator también.
    expect(out.split("\n").filter((l) => l.includes("|")).length).toBe(4);
  });

  it("parte una tabla concatenada en una sola línea (caso real del chat)", () => {
    const text =
      "| Empresa | Localidad | Ingresos | |---------|-----------|----------| | Acme | Madrid | 5,2M€ | | Globex | Bilbao | 3,1M€ |";
    const out = normalizeChatMarkdown(text);
    const lines = out.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(4); // header + separator + 2 filas
    expect(lines[0]).toContain("Empresa");
    expect(lines[1]).toMatch(/^\|-+/);
    expect(lines[2]).toContain("Acme");
    expect(lines[3]).toContain("Globex");
  });

  it("preserva texto narrativo antes de la tabla (preludio)", () => {
    const text =
      "Estas son las empresas: | Empresa | Ingresos | |---|---| | Acme | 5,2M€ |";
    const out = normalizeChatMarkdown(text);
    const lines = out.split("\n").filter((l) => l.trim());
    expect(lines[0]).toBe("Estas son las empresas:");
    expect(lines[1]).toContain("Empresa");
    expect(lines[2]).toMatch(/^\|-+/);
    expect(lines[3]).toContain("Acme");
  });

  it("parte tablas con muchas columnas y muchas filas", () => {
    const text =
      "| A | B | C | D | E | F | G | |---|---|---|---|---|---|---| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | | 8 | 9 | 10 | 11 | 12 | 13 | 14 |";
    const out = normalizeChatMarkdown(text);
    const lines = out.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain("1");
    expect(lines[3]).toContain("8");
  });

  it("añade salto de línea doble antes de heading pegado a frase", () => {
    const text = "Esto es texto.## Mi heading";
    const out = normalizeChatMarkdown(text);
    expect(out).toBe("Esto es texto.\n\n## Mi heading");
  });

  it("no toca headings ya bien separados", () => {
    const text = "Esto es texto.\n\n## Mi heading";
    expect(normalizeChatMarkdown(text)).toBe(text);
  });

  it("respeta bloques de código y no toca pipes dentro", () => {
    const text = [
      "Ejemplo:",
      "```",
      "| no | es | tabla |",
      "```",
      "Y aquí sí: | A | B | |---|---| | 1 | 2 |",
    ].join("\n");
    const out = normalizeChatMarkdown(text);
    // El bloque de código sigue intacto, sin partir.
    expect(out).toContain("```\n| no | es | tabla |\n```");
    // La tabla fuera del bloque queda en 3 líneas (header + separator + 1 row).
    const lines = out.split("\n");
    const aBLineIdx = lines.findIndex((l) => l.includes("| A | B |") && !l.includes("---"));
    expect(aBLineIdx).toBeGreaterThan(-1);
    expect(lines[aBLineIdx + 1]).toMatch(/^\|-+/);
    expect(lines[aBLineIdx + 2]).toContain("1");
  });

  it("no toca pipe suelto que no es separador (ej. URL)", () => {
    const text = "Mira esta URL: https://example.com|param y sigue.";
    expect(normalizeChatMarkdown(text)).toBe(text);
  });

  it("maneja el caso completo del screenshot real (modelo concatena todo)", () => {
    const text =
      "Te voy a buscar las empresas más grandes de Álava basándome en los datos financieros más recientes disponibles.## Las empresas más grandes de Álava\n\n| Empresa | Localidad | Sector | Empleados | Ingresos | Año | |---------|-----------|--------|-----------|----------|------| | ERAIKUNTZA | Vitoria-Gasteiz | PCI | 101 | 54.8M€ | 2024 | | VENTICLIMA | Vitoria-Gasteiz | PCI | 39 | 13.1M€ | 2024 |";
    const out = normalizeChatMarkdown(text);

    // El heading pegado debe haber ganado un \n\n antes
    expect(out).toContain("disponibles.\n\n## Las empresas");
    // Las 2 filas de datos deben estar en líneas separadas
    const lines = out.split("\n");
    const dataLines = lines.filter((l) => l.includes("ERAIKUNTZA") || l.includes("VENTICLIMA"));
    expect(dataLines).toHaveLength(2);
    expect(dataLines[0]).toContain("ERAIKUNTZA");
    expect(dataLines[1]).toContain("VENTICLIMA");
  });
});
