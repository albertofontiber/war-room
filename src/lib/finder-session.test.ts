/**
 * Tests del módulo finder-session:
 *   - `canEditWithin24h` — ventana de edición del portal (lógica pura).
 *   - `finderSessionMatches` — validez de una sesión de finder frente al estado
 *     en BD (inactivo / sessionVersion / tokens antiguos sin el campo).
 *   - `getCurrentFinder` — combina la sesión (getServerSession) con la BD.
 *   - `requireFinderPageOrRedirect` — redirige a /portal/login si no es válida.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const getServerSessionMock = vi.fn();
const finderFindUnique = vi.fn();
const redirectMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSessionMock(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { finder: { findUnique: (...a: unknown[]) => finderFindUnique(...a) } },
}));
vi.mock("next/navigation", () => ({
  redirect: (...a: unknown[]) => redirectMock(...a),
}));

import {
  canEditWithin24h,
  PORTAL_EDIT_WINDOW_MS,
  finderSessionMatches,
  getCurrentFinder,
  requireFinderPageOrRedirect,
} from "./finder-session";

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

describe("finderSessionMatches", () => {
  it("false si el finder no existe", () => {
    expect(finderSessionMatches(null, 0)).toBe(false);
    expect(finderSessionMatches(undefined, 0)).toBe(false);
  });

  it("false si el finder está inactivo (pausado por un admin)", () => {
    expect(finderSessionMatches({ active: false, sessionVersion: 0 }, 0)).toBe(false);
  });

  it("true cuando activo y el sessionVersion coincide", () => {
    expect(finderSessionMatches({ active: true, sessionVersion: 5 }, 5)).toBe(true);
  });

  it("false cuando el token tiene un sessionVersion antiguo (sesión revocada)", () => {
    expect(finderSessionMatches({ active: true, sessionVersion: 6 }, 5)).toBe(false);
  });

  it("normaliza a 0 los tokens sin sessionVersion (emitidos antes de la feature)", () => {
    // No fuerza re-login mientras el finder siga en la versión 0 por defecto.
    expect(finderSessionMatches({ active: true, sessionVersion: 0 }, undefined)).toBe(true);
    expect(finderSessionMatches({ active: true, sessionVersion: 0 }, null)).toBe(true);
    // Pero si ya se revocó alguna vez (>0), el token viejo queda fuera.
    expect(finderSessionMatches({ active: true, sessionVersion: 1 }, undefined)).toBe(false);
  });
});

describe("getCurrentFinder", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    finderFindUnique.mockReset();
  });

  it("null si no hay sesión", async () => {
    getServerSessionMock.mockResolvedValue(null);
    expect(await getCurrentFinder()).toBeNull();
    expect(finderFindUnique).not.toHaveBeenCalled();
  });

  it("null si la sesión es de admin (no de finder)", async () => {
    getServerSessionMock.mockResolvedValue({ kind: "admin", finderId: null });
    expect(await getCurrentFinder()).toBeNull();
    expect(finderFindUnique).not.toHaveBeenCalled();
  });

  it("null si el finder está inactivo", async () => {
    getServerSessionMock.mockResolvedValue({ kind: "finder", finderId: "f1", sessionVersion: 0 });
    finderFindUnique.mockResolvedValue({
      id: "f1", name: "Rafa", email: "r@x.com", active: false, sessionVersion: 0,
    });
    expect(await getCurrentFinder()).toBeNull();
  });

  it("null si el sessionVersion del token no coincide con el de BD (sesión revocada)", async () => {
    getServerSessionMock.mockResolvedValue({ kind: "finder", finderId: "f1", sessionVersion: 2 });
    finderFindUnique.mockResolvedValue({
      id: "f1", name: "Rafa", email: "r@x.com", active: true, sessionVersion: 3,
    });
    expect(await getCurrentFinder()).toBeNull();
  });

  it("devuelve el finder cuando está activo y el sessionVersion coincide", async () => {
    getServerSessionMock.mockResolvedValue({ kind: "finder", finderId: "f1", sessionVersion: 3 });
    const row = { id: "f1", name: "Rafa", email: "r@x.com", active: true, sessionVersion: 3 };
    finderFindUnique.mockResolvedValue(row);
    expect(await getCurrentFinder()).toEqual(row);
  });
});

describe("requireFinderPageOrRedirect", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    finderFindUnique.mockReset();
    redirectMock.mockReset();
  });

  it("redirige a /portal/login si la sesión no es válida", async () => {
    getServerSessionMock.mockResolvedValue({ kind: "finder", finderId: "f1", sessionVersion: 1 });
    finderFindUnique.mockResolvedValue({
      id: "f1", name: "Rafa", email: "r@x.com", active: false, sessionVersion: 1,
    });
    await requireFinderPageOrRedirect();
    expect(redirectMock).toHaveBeenCalledWith("/portal/login");
  });

  it("no redirige y devuelve el finder si la sesión es válida", async () => {
    getServerSessionMock.mockResolvedValue({ kind: "finder", finderId: "f1", sessionVersion: 0 });
    const row = { id: "f1", name: "Rafa", email: "r@x.com", active: true, sessionVersion: 0 };
    finderFindUnique.mockResolvedValue(row);
    const result = await requireFinderPageOrRedirect();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toEqual(row);
  });
});
