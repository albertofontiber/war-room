/**
 * Tests para POST /api/leads/[id]/link — vincula un lead anónimo a una empresa
 * real, fusionando relaciones (Nota, Tarea, CrmLog, FinderNote, TargetProposal,
 * Financiero) en transacción.
 *
 * Cubre: auth, validación, validaciones de dominio (lead vs target, distintos
 * ids, esAnonima), comportamiento de la transacción (mover relaciones simples,
 * resolver colisión de Financiero por (empresaId, anio), prevalencia del
 * CrmEstado del lead, herencia de finderSourceId, log de auditoría, borrado).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();

vi.mock("@/lib/user-from-session", () => ({
  requireCurrentUser: () => requireUserMock(),
}));

// La transacción se ejecuta inline pasándole un `tx` que es el mismo set de
// mocks que prisma. Así verificamos las llamadas igual que sin transacción.
const tx = {
  empresa: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  nota: { updateMany: vi.fn() },
  tarea: { updateMany: vi.fn() },
  crmLog: { updateMany: vi.fn(), create: vi.fn() },
  finderNote: { updateMany: vi.fn() },
  targetProposal: { updateMany: vi.fn() },
  financiero: {
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  crmEstado: { delete: vi.fn(), update: vi.fn() },
};

const txMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => txMock(fn),
  },
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

function resetTxMocks() {
  Object.values(tx).forEach((model) => {
    Object.values(model as Record<string, unknown>).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
  });
}

describe("POST /api/leads/[id]/link", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    txMock.mockReset();
    resetTxMocks();
    requireUserMock.mockResolvedValue({ id: "user-alberto", name: "Alberto" });
    // Por defecto: la transacción ejecuta el callback con nuestro tx mock.
    txMock.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("401 si no hay usuario en sesión", async () => {
    requireUserMock.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(401);
  });

  it("400 si el id del lead no es numérico", async () => {
    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "abc" } });
    expect(res.status).toBe(400);
  });

  it("400 si el body es inválido (falta targetEmpresaId)", async () => {
    const res = await POST(makeReq({}), { params: { id: "1" } });
    expect(res.status).toBe(400);
  });

  it("400 si lead === target (no se puede vincular consigo mismo)", async () => {
    const res = await POST(makeReq({ targetEmpresaId: 5 }), { params: { id: "5" } });
    expect(res.status).toBe(400);
    expect(txMock).not.toHaveBeenCalled();
  });

  it("404 si el lead no existe", async () => {
    tx.empresa.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(404);
  });

  it("400 si la empresa origen no es anónima (no es lead)", async () => {
    tx.empresa.findUnique.mockResolvedValueOnce({
      id: 1,
      esAnonima: false,
      crmEstado: null,
    });
    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(400);
  });

  it("404 si el target no existe", async () => {
    tx.empresa.findUnique
      .mockResolvedValueOnce({ id: 1, esAnonima: true, nombre: "Asher", crmEstado: null })
      .mockResolvedValueOnce(null);
    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(404);
  });

  it("400 si el target es a su vez una empresa anónima", async () => {
    tx.empresa.findUnique
      .mockResolvedValueOnce({ id: 1, esAnonima: true, nombre: "Asher", crmEstado: null })
      .mockResolvedValueOnce({ id: 100, esAnonima: true, crmEstado: null });
    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(400);
  });

  it("happy path: mueve relaciones, prevalece CrmEstado del lead y borra el lead", async () => {
    tx.empresa.findUnique
      .mockResolvedValueOnce({
        id: 1,
        esAnonima: true,
        nombre: "Asher",
        finderSourceId: null,
        crmEstado: { dealStage: "analisis" },
      })
      .mockResolvedValueOnce({
        id: 100,
        esAnonima: false,
        nombre: "Empresa Real",
        finderSourceId: null,
        crmEstado: null,
      });
    tx.financiero.findMany
      // primer findMany = años en el target
      .mockResolvedValueOnce([])
      // segundo findMany = financieros del lead
      .mockResolvedValueOnce([]);

    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(200);

    expect(tx.nota.updateMany).toHaveBeenCalledWith({
      where: { empresaId: 1 },
      data: { empresaId: 100 },
    });
    expect(tx.tarea.updateMany).toHaveBeenCalledWith({
      where: { empresaId: 1 },
      data: { empresaId: 100 },
    });
    expect(tx.crmLog.updateMany).toHaveBeenCalled();
    expect(tx.finderNote.updateMany).toHaveBeenCalled();
    expect(tx.targetProposal.updateMany).toHaveBeenCalled();

    // CrmEstado del lead se mueve al target (target no tenía).
    expect(tx.crmEstado.delete).not.toHaveBeenCalled();
    expect(tx.crmEstado.update).toHaveBeenCalledWith({
      where: { empresaId: 1 },
      data: { empresaId: 100 },
    });

    // Log de auditoría: como target no tenía → "new_deal".
    expect(tx.crmLog.create).toHaveBeenCalledTimes(1);
    expect(tx.crmLog.create.mock.calls[0][0].data).toMatchObject({
      empresaId: 100,
      event: "new_deal",
      fromStage: null,
      toStage: "analisis",
      autorId: "user-alberto",
    });
    expect(tx.crmLog.create.mock.calls[0][0].data.note).toContain("Asher");

    // Lead borrado al final.
    expect(tx.empresa.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it("target tenía CrmEstado: se borra primero y luego el del lead lo reemplaza", async () => {
    tx.empresa.findUnique
      .mockResolvedValueOnce({
        id: 1,
        esAnonima: true,
        nombre: "Asher",
        finderSourceId: null,
        crmEstado: { dealStage: "loi_enviada" },
      })
      .mockResolvedValueOnce({
        id: 100,
        esAnonima: false,
        nombre: "Empresa Real",
        finderSourceId: null,
        crmEstado: { dealStage: "contactado" },
      });
    tx.financiero.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(200);

    expect(tx.crmEstado.delete).toHaveBeenCalledWith({ where: { empresaId: 100 } });
    expect(tx.crmEstado.update).toHaveBeenCalledWith({
      where: { empresaId: 1 },
      data: { empresaId: 100 },
    });
    // Como ya tenía stage previo: log con event="stage_changed".
    expect(tx.crmLog.create.mock.calls[0][0].data).toMatchObject({
      event: "stage_changed",
      fromStage: "contactado",
      toStage: "loi_enviada",
    });
  });

  it("lead sin CrmEstado: target tampoco se toca", async () => {
    tx.empresa.findUnique
      .mockResolvedValueOnce({
        id: 1,
        esAnonima: true,
        nombre: "Asher",
        finderSourceId: null,
        crmEstado: null,
      })
      .mockResolvedValueOnce({
        id: 100,
        esAnonima: false,
        nombre: "Empresa Real",
        finderSourceId: null,
        crmEstado: null,
      });
    tx.financiero.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(200);

    expect(tx.crmEstado.delete).not.toHaveBeenCalled();
    expect(tx.crmEstado.update).not.toHaveBeenCalled();
    // Log de auditoría con toStage=null (no había stage que mover).
    expect(tx.crmLog.create.mock.calls[0][0].data).toMatchObject({
      event: "new_deal",
      fromStage: null,
      toStage: null,
    });
  });

  it("financiero: año en colisión se descarta del lead, año limpio se mueve", async () => {
    tx.empresa.findUnique
      .mockResolvedValueOnce({
        id: 1,
        esAnonima: true,
        nombre: "Asher",
        finderSourceId: null,
        crmEstado: null,
      })
      .mockResolvedValueOnce({
        id: 100,
        esAnonima: false,
        nombre: "Empresa Real",
        finderSourceId: null,
        crmEstado: null,
      });
    // target ya tiene 2024
    tx.financiero.findMany
      .mockResolvedValueOnce([{ anio: 2024 }])
      // lead trae 2024 (colisiona) y 2023 (no)
      .mockResolvedValueOnce([
        { id: 11, anio: 2024 },
        { id: 12, anio: 2023 },
      ]);

    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(200);

    expect(tx.financiero.delete).toHaveBeenCalledWith({ where: { id: 11 } });
    expect(tx.financiero.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { empresaId: 100 },
    });
  });

  it("hereda finderSourceId del lead si el target no tenía", async () => {
    tx.empresa.findUnique
      .mockResolvedValueOnce({
        id: 1,
        esAnonima: true,
        nombre: "Asher",
        finderSourceId: "finder-x",
        crmEstado: null,
      })
      .mockResolvedValueOnce({
        id: 100,
        esAnonima: false,
        nombre: "Empresa Real",
        finderSourceId: null,
        crmEstado: null,
      });
    tx.financiero.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(200);

    expect(tx.empresa.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { finderSourceId: "finder-x" },
    });
  });

  it("NO sobreescribe finderSourceId del target (target manda)", async () => {
    tx.empresa.findUnique
      .mockResolvedValueOnce({
        id: 1,
        esAnonima: true,
        nombre: "Asher",
        finderSourceId: "finder-x",
        crmEstado: null,
      })
      .mockResolvedValueOnce({
        id: 100,
        esAnonima: false,
        nombre: "Empresa Real",
        finderSourceId: "finder-existente",
        crmEstado: null,
      });
    tx.financiero.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await POST(makeReq({ targetEmpresaId: 100 }), { params: { id: "1" } });
    expect(res.status).toBe(200);

    expect(tx.empresa.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finderSourceId: expect.anything() }),
      })
    );
  });
});
