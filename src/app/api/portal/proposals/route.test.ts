/**
 * Tests para POST /api/portal/proposals — un finder propone un nuevo target.
 *
 * Cubre: auth (finder activo obligatorio), validación, dedup por CIF (exacto),
 * dedup por nombre normalizado, creación PENDING, log de auditoría con
 * action=propose_target / propose_target_duplicate, notificación a admins
 * fire-and-forget.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireFinderMock = vi.fn();
const empresaFindUnique = vi.fn();
const empresaFindMany = vi.fn();
const proposalCreate = vi.fn();
const logAction = vi.fn();
const notifyAdmins = vi.fn();

vi.mock("@/lib/finder-session", () => ({
  requireCurrentFinder: () => requireFinderMock(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    empresa: {
      findUnique: (...a: unknown[]) => empresaFindUnique(...a),
      findMany: (...a: unknown[]) => empresaFindMany(...a),
    },
    targetProposal: { create: (...a: unknown[]) => proposalCreate(...a) },
  },
}));
vi.mock("@/lib/finder-access-log", () => ({
  logFinderAction: (...a: unknown[]) => logAction(...a),
}));
vi.mock("@/lib/notifications", () => ({
  notifyAdmins: (...a: unknown[]) => notifyAdmins(...a),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const finder = { id: "finder-1", name: "Pepe", email: "p@x.com", active: true };

describe("POST /api/portal/proposals", () => {
  beforeEach(() => {
    requireFinderMock.mockReset();
    empresaFindUnique.mockReset();
    empresaFindMany.mockReset();
    proposalCreate.mockReset();
    logAction.mockReset();
    notifyAdmins.mockReset();
    requireFinderMock.mockResolvedValue(finder);
    proposalCreate.mockResolvedValue({
      id: 42,
      companyName: "Foo",
      createdAt: new Date(),
      status: "PENDING",
    });
    logAction.mockResolvedValue(undefined);
    notifyAdmins.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("401 si no hay finder en sesión", async () => {
    requireFinderMock.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq({ companyName: "Foo" }));
    expect(res.status).toBe(401);
  });

  it("400 si falta companyName", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("happy path SIN duplicado: crea PENDING + log propose_target + notifica admins", async () => {
    empresaFindMany.mockResolvedValue([
      { nombre: "Otra Empresa SL" },
      { nombre: "Tercera Cosa SA" },
    ]);
    const res = await POST(
      makeReq({
        companyName: "Empresa Nueva",
        cif: "B12345678",
        notes: "  Contacto inicial  ",
      })
    );
    expect(res.status).toBe(201);

    // Dedup por CIF (no encontrada).
    expect(empresaFindUnique).toHaveBeenCalledWith({
      where: { cif: "B12345678" },
      select: { id: true },
    });

    // Crea propuesta PENDING con campos saneados (trim).
    const createArgs = proposalCreate.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      finderId: "finder-1",
      companyName: "Empresa Nueva",
      cif: "B12345678",
      notes: "Contacto inicial",
      status: "PENDING",
    });

    // Log con action=propose_target (no duplicado).
    expect(logAction).toHaveBeenCalledWith({
      finderId: "finder-1",
      action: "propose_target",
      resourceId: "42",
    });

    // Notifica admins (fire-and-forget, no se espera el resultado).
    expect(notifyAdmins).toHaveBeenCalled();
    expect(notifyAdmins.mock.calls[0][0].titulo).toContain("Pepe");
    expect(notifyAdmins.mock.calls[0][0].titulo).not.toContain("posible duplicado");
  });

  it("CIF en BD: marca como duplicado pero crea propuesta igualmente", async () => {
    empresaFindUnique.mockResolvedValue({ id: 999 });
    const res = await POST(makeReq({ companyName: "X", cif: "B11111111" }));
    expect(res.status).toBe(201);

    // Como existe, NO se hace búsqueda por nombre normalizado.
    expect(empresaFindMany).not.toHaveBeenCalled();
    // Propuesta igualmente creada como PENDING.
    expect(proposalCreate).toHaveBeenCalled();
    // Log con action duplicado.
    expect(logAction.mock.calls[0][0].action).toBe("propose_target_duplicate");
    // Título de la notificación menciona "posible duplicado".
    expect(notifyAdmins.mock.calls[0][0].titulo).toContain("posible duplicado");
  });

  it("CIF se normaliza (trim + uppercase) antes de comparar", async () => {
    empresaFindUnique.mockResolvedValue(null);
    empresaFindMany.mockResolvedValue([]);
    await POST(makeReq({ companyName: "X", cif: "  b12345678  " }));
    expect(empresaFindUnique).toHaveBeenCalledWith({
      where: { cif: "B12345678" },
      select: { id: true },
    });
    expect(proposalCreate.mock.calls[0][0].data.cif).toBe("B12345678");
  });

  it("dedup por nombre normalizado: detecta colisión aunque difiera espacios/tildes/jurídico", async () => {
    empresaFindMany.mockResolvedValue([{ nombre: "  EMPRESA   ÁCME, S.L.  " }]);
    const res = await POST(makeReq({ companyName: "Empresa Acme SL" }));
    expect(res.status).toBe(201);
    // Aunque se crea, se marca como duplicado.
    expect(logAction.mock.calls[0][0].action).toBe("propose_target_duplicate");
    expect(notifyAdmins.mock.calls[0][0].titulo).toContain("posible duplicado");
  });

  it("nombre menor de 3 chars normalizados: skip dedup por nombre (no hace findMany)", async () => {
    // "x" + sin CIF → no se gatilla la búsqueda en universo.
    const res = await POST(makeReq({ companyName: "X" }));
    expect(res.status).toBe(201);
    expect(empresaFindMany).not.toHaveBeenCalled();
    // No es duplicado.
    expect(logAction.mock.calls[0][0].action).toBe("propose_target");
  });

  it("notifyAdmins puede fallar sin tirar la propuesta", async () => {
    empresaFindMany.mockResolvedValue([]);
    notifyAdmins.mockRejectedValue(new Error("Resend down"));
    const res = await POST(makeReq({ companyName: "Foo" }));
    // 201 igualmente (fire-and-forget, ya está creada).
    expect(res.status).toBe(201);
    expect(proposalCreate).toHaveBeenCalled();
    // Esperamos a que el .catch resuelva (microtask).
    await new Promise((r) => setImmediate(r));
  });
});
