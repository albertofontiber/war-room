/**
 * Tests para diffFields — helper que calcula el diff de campos entre dos
 * objetos planos para usarlo en `auditLog({action:'update', before, after})`.
 *
 * `auditLog()` propio (que escribe en BD) requiere mockear Prisma y se cubre
 * en otra suite si hace falta. Aquí solo testeamos la lógica pura.
 */

import { describe, expect, it } from "vitest";
import { diffFields } from "./audit-log";

describe("diffFields", () => {
  it("solo incluye campos que cambiaron", () => {
    const prev = { titulo: "A", descripcion: "X", completada: false };
    const next = { titulo: "B", descripcion: "X", completada: true };
    const { before, after } = diffFields(prev, next);
    expect(before).toEqual({ titulo: "A", completada: false });
    expect(after).toEqual({ titulo: "B", completada: true });
    // descripcion no cambió → no aparece.
    expect(after).not.toHaveProperty("descripcion");
  });

  it("objeto vacío si nada cambió", () => {
    const prev = { a: 1, b: 2 };
    const next = { a: 1, b: 2 };
    const { before, after } = diffFields(prev, next);
    expect(after).toEqual({});
    expect(before).toEqual({});
  });

  it("ignora claves de prev que no están en next (partial update)", () => {
    const prev = { a: 1, b: 2, c: 3 };
    const next: Partial<typeof prev> = { a: 99 }; // solo se actualiza 'a'
    const { before, after } = diffFields(prev, next);
    expect(after).toEqual({ a: 99 });
    expect(before).toEqual({ a: 1 });
    // b y c no se mencionan en next → no se reportan como cambio.
    expect(after).not.toHaveProperty("b");
    expect(after).not.toHaveProperty("c");
  });

  it("trata Date por valor (mismo timestamp = sin cambio)", () => {
    const t = new Date("2026-05-01T12:00:00Z");
    const prev = { fecha: t };
    const next = { fecha: new Date(t.getTime()) };
    const { after } = diffFields(prev, next);
    expect(after).toEqual({});
  });

  it("detecta cambio de Date a otra fecha", () => {
    const prev = { fecha: new Date("2026-05-01T00:00:00Z") };
    const next = { fecha: new Date("2026-06-01T00:00:00Z") };
    const { before, after } = diffFields(prev, next);
    expect(before.fecha).toEqual(prev.fecha);
    expect(after.fecha).toEqual(next.fecha);
  });

  it("trata null como valor (null → string es cambio)", () => {
    const prev = { resultado: null as string | null };
    const next = { resultado: "todo OK" };
    const { before, after } = diffFields(prev, next);
    expect(before).toEqual({ resultado: null });
    expect(after).toEqual({ resultado: "todo OK" });
  });

  it("string → null se detecta como cambio", () => {
    const prev = { resultado: "viejo" as string | null };
    const next = { resultado: null };
    const { before, after } = diffFields(prev, next);
    expect(before).toEqual({ resultado: "viejo" });
    expect(after).toEqual({ resultado: null });
  });

  it("undefined ≠ null (cambia si pasamos explícitamente undefined)", () => {
    const prev = { x: null as unknown };
    const next = { x: undefined };
    const { after } = diffFields(prev, next);
    // shallowEqual considera null !== undefined → SÍ es cambio.
    expect(after).toHaveProperty("x");
  });

  it("objetos como referencia distinta SÍ se reportan (shallowEqual)", () => {
    // Objetos siempre se comparan por referencia. Útil saberlo: si el caller
    // pasa el mismo objeto, no es cambio; si pasa una copia con mismo contenido,
    // sí lo será. En la práctica los callers pasan primitivos + Date.
    const obj = { foo: 1 };
    const { after } = diffFields({ x: obj }, { x: obj });
    expect(after).toEqual({});
    const { after: after2 } = diffFields({ x: { foo: 1 } }, { x: { foo: 1 } });
    expect(after2).toHaveProperty("x");
  });
});
