/**
 * Tests para PATCH y DELETE /api/portal/notas/[id] — operaciones del finder
 * sobre sus propias notas, sujetas a la ventana de edición de 24h.
 *
 * Cubre: auth, validación, ownership (finder solo edita las suyas → 404 si no
 * es suya), regla 24h (403 si vencida), update + audit log con diff de
 * contenido, delete + audit log con before, no-op si nada cambia.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireFinderMock = vi.fn();
const notaFindFirst = vi.fn();
const notaFindUnique = vi.fn();
const notaUpdate = vi.fn();
const notaDelete = vi.fn();
const auditLogMock = vi.fn();

vi.mock("@/lib/finder-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/finder-session")>(
    "@/lib/finder-session"
  );
  return {
    ...actual,
    requireCurrentFinder: () => requireFinderMock(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    nota: {
      findFirst: (...a: unknown[]) => notaFindFirst(...a),
      findUnique: (...a: unknown[]) => notaFindUnique(...a),
      update: (...a: unknown[]) => notaUpdate(...a),
      delete: (...a: unknown[]) => notaDelete(...a),
    },
  },
}));

vi.mock("@/lib/audit-log", () => ({
  auditLog: (...a: unknown[]) => auditLogMock(...a),
}));

vi.mock("@/lib/finder-access-log", () => ({
  logFinderAction: vi.fn(),
}));

import { PATCH, DELETE } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0];
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const finder = { id: "finder-1", name: "Pepe", email: "p@x.com", active: true };
const NOW = new Date("2026-05-01T12:00:00.000Z").getTime();

describe("PATCH /api/portal/notas/[id]", () => {
  beforeEach(() => {
    // toFake: ['Date'] mantiene timers reales (setImmediate, setTimeout) para
    // que los `await new Promise((r) => setImmediate(r))` que vacían microtasks
    // del `void auditLog()` no se queden colgados.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    requireFinderMock.mockReset();
    notaFindFirst.mockReset();
    notaFindUnique.mockReset();
    notaUpdate.mockReset();
    notaDelete.mockReset();
    auditLogMock.mockReset();
    requireFinderMock.mockResolvedValue(finder);
    auditLogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("401 si no hay finder en sesión", async () => {
    requireFinderMock.mockRejectedValue(new Error("Unauthorized"));
    const res = await PATCH(makeReq({ contenido: "x" }), routeContext("1"));
    expect(res.status).toBe(401);
  });

  it("400 si el body es inválido (contenido vacío)", async () => {
    const res = await PATCH(makeReq({ contenido: "" }), routeContext("1"));
    expect(res.status).toBe(400);
  });

  it("400 si el id no es numérico", async () => {
    const res = await PATCH(makeReq({ contenido: "x" }), routeContext("abc"));
    expect(res.status).toBe(400);
  });

  it("404 si la nota no existe o no es del finder (sin leak de existencia)", async () => {
    notaFindFirst.mockResolvedValue(null);
    const res = await PATCH(makeReq({ contenido: "x" }), routeContext("1"));
    expect(res.status).toBe(404);
    // La query filtra por autorFinderId = sesión → no leak de notas de otros.
    expect(notaFindFirst).toHaveBeenCalledWith({
      where: { id: 1, autorFinderId: "finder-1" },
      select: { id: true, createdAt: true },
    });
  });

  it("403 si la nota es vieja (ventana 24h vencida)", async () => {
    notaFindFirst.mockResolvedValue({
      id: 1,
      createdAt: new Date(NOW - 25 * 60 * 60 * 1000),
    });
    const res = await PATCH(makeReq({ contenido: "x" }), routeContext("1"));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("24h");
    expect(notaUpdate).not.toHaveBeenCalled();
  });

  it("happy path: actualiza contenido y registra auditLog con diff", async () => {
    notaFindFirst.mockResolvedValue({
      id: 1,
      createdAt: new Date(NOW - 60_000),
    });
    notaFindUnique.mockResolvedValue({ contenido: "viejo" });
    notaUpdate.mockResolvedValue({
      id: 1,
      contenido: "nuevo",
      createdAt: new Date(NOW - 60_000),
      autorFinder: { name: "Pepe" },
    });
    const res = await PATCH(
      makeReq({ contenido: "nuevo" }),
      routeContext("1")
    );
    expect(res.status).toBe(200);
    expect(notaUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { contenido: "nuevo" },
      select: expect.any(Object),
    });
    // Esperamos a la microtask del void auditLog().
    await new Promise((r) => setImmediate(r));
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "finder",
        actorId: "finder-1",
        action: "update",
        entityType: "nota",
        entityId: 1,
        before: { contenido: "viejo" },
        after: { contenido: "nuevo" },
      })
    );
  });

  it("contenido idéntico: NO loguea (no hubo cambio real)", async () => {
    notaFindFirst.mockResolvedValue({
      id: 1,
      createdAt: new Date(NOW - 60_000),
    });
    notaFindUnique.mockResolvedValue({ contenido: "igual" });
    notaUpdate.mockResolvedValue({
      id: 1,
      contenido: "igual",
      createdAt: new Date(NOW - 60_000),
      autorFinder: { name: "Pepe" },
    });
    const res = await PATCH(
      makeReq({ contenido: "igual" }),
      routeContext("1")
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(auditLogMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/portal/notas/[id]", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    requireFinderMock.mockReset();
    notaFindFirst.mockReset();
    notaFindUnique.mockReset();
    notaDelete.mockReset();
    auditLogMock.mockReset();
    requireFinderMock.mockResolvedValue(finder);
    auditLogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("401 si no hay finder en sesión", async () => {
    requireFinderMock.mockRejectedValue(new Error("Unauthorized"));
    const res = await DELETE(
      {} as unknown as Parameters<typeof DELETE>[0],
      routeContext("1")
    );
    expect(res.status).toBe(401);
  });

  it("404 si la nota no es del finder", async () => {
    notaFindFirst.mockResolvedValue(null);
    const res = await DELETE(
      {} as unknown as Parameters<typeof DELETE>[0],
      routeContext("1")
    );
    expect(res.status).toBe(404);
    expect(notaDelete).not.toHaveBeenCalled();
  });

  it("403 si la nota es vieja (ventana 24h vencida)", async () => {
    notaFindFirst.mockResolvedValue({
      id: 1,
      createdAt: new Date(NOW - 25 * 60 * 60 * 1000),
    });
    const res = await DELETE(
      {} as unknown as Parameters<typeof DELETE>[0],
      routeContext("1")
    );
    expect(res.status).toBe(403);
    expect(notaDelete).not.toHaveBeenCalled();
  });

  it("happy path: borra y registra auditLog con before", async () => {
    notaFindFirst.mockResolvedValue({
      id: 1,
      createdAt: new Date(NOW - 60_000),
    });
    notaFindUnique.mockResolvedValue({
      contenido: "lo que tenía",
      empresaId: 99,
    });
    notaDelete.mockResolvedValue(undefined);
    const res = await DELETE(
      {} as unknown as Parameters<typeof DELETE>[0],
      routeContext("1")
    );
    expect(res.status).toBe(200);
    expect(notaDelete).toHaveBeenCalledWith({ where: { id: 1 } });
    await new Promise((r) => setImmediate(r));
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "finder",
        actorId: "finder-1",
        action: "delete",
        entityType: "nota",
        entityId: 1,
        before: { contenido: "lo que tenía", empresaId: 99 },
      })
    );
  });
});
