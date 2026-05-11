/**
 * Tests del parser de menciones (`@[Name](u:id|f:id)`).
 *
 * Cubre: extracción simple, dedup por (kind, id), construcción de marcador,
 * stripMencionMarkers para previews. La integración con Prisma + notifications
 * (`processMenciones`) se verifica vía e2e tras el deploy.
 */

import { describe, expect, it } from "vitest";
import { extractMenciones, buildMencionMarker, stripMencionMarkers } from "./menciones";

describe("extractMenciones", () => {
  it("extrae una sola mención admin", () => {
    const r = extractMenciones("Hola @[Alberto](u:abc123), revisa esto");
    expect(r).toEqual([{ kind: "u", id: "abc123", name: "Alberto" }]);
  });

  it("extrae mención a finder con prefijo f:", () => {
    const r = extractMenciones("@[Pepe Finder](f:xyz789) este target es tuyo");
    expect(r).toEqual([{ kind: "f", id: "xyz789", name: "Pepe Finder" }]);
  });

  it("extrae múltiples menciones, mantiene orden", () => {
    const r = extractMenciones(
      "@[Alberto](u:1) avisa a @[Gabriel](u:2) y @[Finder1](f:abc)"
    );
    expect(r).toEqual([
      { kind: "u", id: "1", name: "Alberto" },
      { kind: "u", id: "2", name: "Gabriel" },
      { kind: "f", id: "abc", name: "Finder1" },
    ]);
  });

  it("dedup: mencionar dos veces al mismo solo cuenta una", () => {
    const r = extractMenciones("@[Alberto](u:abc) @[Alberto](u:abc) hello");
    expect(r).toEqual([{ kind: "u", id: "abc", name: "Alberto" }]);
  });

  it("dedup: misma id pero kinds distintos NO se deduplican", () => {
    // Caso teórico: un user y un finder con el mismo cuid (en práctica imposible
    // con cuid()). Mantengo dedup por (kind, id) como contrato.
    const r = extractMenciones("@[Foo](u:abc) @[Foo](f:abc)");
    expect(r).toHaveLength(2);
  });

  it("ignora '@' suelto sin formato de marcador", () => {
    const r = extractMenciones("Email: alberto@fontiber.com y @ otra cosa");
    expect(r).toEqual([]);
  });

  it("ignora marcador con id vacío o caracteres no permitidos", () => {
    expect(extractMenciones("@[X](u:)")).toEqual([]);
    expect(extractMenciones("@[X](u:abc/def)")).toEqual([]);
    expect(extractMenciones("@[X](z:abc)")).toEqual([]);
  });

  it("sin menciones → []", () => {
    expect(extractMenciones("texto puro sin nada")).toEqual([]);
    expect(extractMenciones("")).toEqual([]);
  });

  it("nombre con espacios y acentos funciona", () => {
    const r = extractMenciones("@[Álvaro Guitard Maldonado](u:xyz)");
    expect(r).toEqual([{ kind: "u", id: "xyz", name: "Álvaro Guitard Maldonado" }]);
  });
});

describe("buildMencionMarker", () => {
  it("construye marcador admin", () => {
    expect(buildMencionMarker({ kind: "u", id: "abc", name: "Alberto" }))
      .toBe("@[Alberto](u:abc)");
  });

  it("construye marcador finder", () => {
    expect(buildMencionMarker({ kind: "f", id: "xyz", name: "Pepe" }))
      .toBe("@[Pepe](f:xyz)");
  });

  it("sanea corchetes en el nombre (no rompe el formato)", () => {
    expect(buildMencionMarker({ kind: "u", id: "abc", name: "[Hack]] Alberto" }))
      .toBe("@[Hack Alberto](u:abc)");
  });
});

describe("stripMencionMarkers", () => {
  it("reemplaza @[Name](kind:id) por @Name", () => {
    expect(stripMencionMarkers("Hola @[Alberto](u:abc), bienvenido"))
      .toBe("Hola @Alberto, bienvenido");
  });

  it("reemplaza múltiples manteniendo el resto del texto", () => {
    expect(
      stripMencionMarkers("@[A](u:1) y @[B](f:2): tarea pendiente")
    ).toBe("@A y @B: tarea pendiente");
  });

  it("texto sin menciones queda intacto", () => {
    expect(stripMencionMarkers("nada que parsear")).toBe("nada que parsear");
  });
});
