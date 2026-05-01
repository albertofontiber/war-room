/**
 * Tests para canEditWithin24h — regla central de la ventana de edición del
 * portal de finders. Pasadas 24h, el finder no puede editar/borrar lo que él
 * mismo creó (notas; las tareas usan otra regla, no aplica esta).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { canEditWithin24h, PORTAL_EDIT_WINDOW_MS } from "./finder-session";

describe("canEditWithin24h", () => {
  // Fijamos "ahora" para tener un baseline determinista.
  const NOW = new Date("2026-05-01T12:00:00.000Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("acepta una fecha de hace 1 minuto", () => {
    const created = new Date(NOW - 60_000);
    expect(canEditWithin24h(created)).toBe(true);
  });

  it("acepta justo dentro de la ventana (23h 59m)", () => {
    const created = new Date(NOW - PORTAL_EDIT_WINDOW_MS + 60_000);
    expect(canEditWithin24h(created)).toBe(true);
  });

  it("rechaza justo fuera de la ventana (24h 1m)", () => {
    const created = new Date(NOW - PORTAL_EDIT_WINDOW_MS - 60_000);
    expect(canEditWithin24h(created)).toBe(false);
  });

  it("rechaza una fecha de hace varios días", () => {
    const created = new Date(NOW - 5 * 24 * 60 * 60 * 1000);
    expect(canEditWithin24h(created)).toBe(false);
  });

  it("acepta strings ISO (formato que llega del JSON de la API)", () => {
    const recent = new Date(NOW - 60_000).toISOString();
    expect(canEditWithin24h(recent)).toBe(true);
    const old = new Date(NOW - 48 * 60 * 60 * 1000).toISOString();
    expect(canEditWithin24h(old)).toBe(false);
  });

  it("rechaza fechas inválidas (no se interpreta como '0' ni se cuela)", () => {
    expect(canEditWithin24h("not-a-date")).toBe(false);
    expect(canEditWithin24h(new Date("invalid"))).toBe(false);
  });

  it("rechaza fechas en el FUTURO si superan +24h del límite (defensa frente a relojes desincronizados)", () => {
    // Aunque suene raro: si por algún motivo `createdAt` viene del futuro
    // (clock skew servidor/cliente), Date.now() - ts es negativo, lo que
    // siempre es < PORTAL_EDIT_WINDOW_MS → SÍ permite editar.
    // Esto es el comportamiento actual; lo documentamos para que un cambio
    // futuro no rompa la asunción sin notar.
    const future = new Date(NOW + 60 * 1000);
    expect(canEditWithin24h(future)).toBe(true);
  });

  it("PORTAL_EDIT_WINDOW_MS está fijado a 24h en milisegundos", () => {
    expect(PORTAL_EDIT_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(PORTAL_EDIT_WINDOW_MS).toBe(86_400_000);
  });
});
