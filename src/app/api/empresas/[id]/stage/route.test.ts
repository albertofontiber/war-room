/**
 * Tests para PATCH /api/empresas/[id]/stage — endpoint que cambia el dealStage
 * de una empresa. Cubre auth (admin obligatorio), validación, casos sacar del
 * funnel, upsert sin cambio, transición real y disparo de side-effects (auto-
 * crear docs cuando entra a `primera_reunion`).
 *
 * Toda interacción con Prisma, sesión y side-effects está mockeada — son tests
 * unitarios del handler, no de la BD.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.fn();
const userFindUnique = vi.fn();
const empresaFindUnique = vi.fn();
const crmEstadoUpsert = vi.fn();
const crmEstadoDelete = vi.fn();
const crmLogCreate = vi.fn();
const empresaUpdate = vi.fn();
const createEmpresaLinks = vi.fn();
const notifyAdmins = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: () => sessionMock() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    empresa: {
      findUnique: (...a: unknown[]) => empresaFindUnique(...a),
      update: (...a: unknown[]) => empresaUpdate(...a),
    },
    crmEstado: {
      upsert: (...a: unknown[]) => crmEstadoUpsert(...a),
      delete: (...a: unknown[]) => crmEstadoDelete(...a),
    },
    crmLog: { create: (...a: unknown[]) => crmLogCreate(...a) },
  },
}));
vi.mock("@/lib/empresa-link-builder", () => ({
  createEmpresaLinks: (...a: unknown[]) => createEmpresaLinks(...a),
}));
vi.mock("@/lib/notifications", () => ({
  notifyAdmins: (...a: unknown[]) => notifyAdmins(...a),
}));
vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0];
}

const adminSession = {
  kind: "admin",
  user: { email: "alberto@fontiber.com" },
};

describe("PATCH /api/empresas/[id]/stage", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    userFindUnique.mockReset();
    empresaFindUnique.mockReset();
    crmEstadoUpsert.mockReset();
    crmEstadoDelete.mockReset();
    crmLogCreate.mockReset();
    empresaUpdate.mockReset();
    createEmpresaLinks.mockReset();
    notifyAdmins.mockReset();
    sessionMock.mockResolvedValue(adminSession);
    userFindUnique.mockResolvedValue({ id: "user-alberto", name: "Alberto" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("401 si no hay sesión", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await PATCH(makeReq({ dealStage: "contactado" }), { params: { id: "1" } });
    expect(res.status).toBe(401);
  });

  it("401 si la sesión no es admin (finder no puede mover stages)", async () => {
    sessionMock.mockResolvedValue({ kind: "finder", finderId: "f1" });
    const res = await PATCH(makeReq({ dealStage: "contactado" }), { params: { id: "1" } });
    expect(res.status).toBe(401);
  });

  it("400 si el id no es numérico", async () => {
    const res = await PATCH(makeReq({ dealStage: "contactado" }), { params: { id: "abc" } });
    expect(res.status).toBe(400);
  });

  it("400 si el body es inválido (zod)", async () => {
    const res = await PATCH(makeReq({ dealStage: "stage_inventado" }), { params: { id: "1" } });
    expect(res.status).toBe(400);
  });

  it("404 si la empresa no existe", async () => {
    empresaFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeReq({ dealStage: "contactado" }), { params: { id: "1" } });
    expect(res.status).toBe(404);
  });

  it("dealStage=null saca del funnel: borra CrmEstado y crea log removed_from_funnel", async () => {
    empresaFindUnique.mockResolvedValue({
      id: 5,
      crmEstado: { dealStage: "analisis" },
    });
    const res = await PATCH(makeReq({ dealStage: null, note: "Pausa" }), { params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(crmEstadoDelete).toHaveBeenCalledWith({ where: { empresaId: 5 } });
    expect(crmLogCreate).toHaveBeenCalledTimes(1);
    expect(crmLogCreate.mock.calls[0][0].data).toMatchObject({
      empresaId: 5,
      event: "removed_from_funnel",
      fromStage: "analisis",
      toStage: null,
      autorId: "user-alberto",
      note: "Pausa",
    });
    expect(crmEstadoUpsert).not.toHaveBeenCalled();
  });

  it("dealStage=null sin CrmEstado previo: NO intenta borrar pero loguea anyway", async () => {
    empresaFindUnique.mockResolvedValue({ id: 5, crmEstado: null });
    const res = await PATCH(makeReq({ dealStage: null }), { params: { id: "5" } });
    expect(res.status).toBe(200);
    expect(crmEstadoDelete).not.toHaveBeenCalled();
    expect(crmLogCreate).toHaveBeenCalledTimes(1);
    expect(crmLogCreate.mock.calls[0][0].data).toMatchObject({
      event: "removed_from_funnel",
      fromStage: null,
    });
  });

  it("nuevo deal (no había CrmEstado previo): upsert + log new_deal", async () => {
    empresaFindUnique.mockResolvedValue({ id: 7, crmEstado: null });
    const res = await PATCH(makeReq({ dealStage: "contactado" }), { params: { id: "7" } });
    expect(res.status).toBe(200);
    expect(crmEstadoUpsert).toHaveBeenCalledTimes(1);
    const upsertArgs = crmEstadoUpsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ empresaId: 7 });
    expect(upsertArgs.create.dealStage).toBe("contactado");
    expect(upsertArgs.create.ownerUserId).toBe("user-alberto");
    expect(upsertArgs.update.dealStage).toBe("contactado");
    expect(upsertArgs.update.fechaEntradaStage).toBeInstanceOf(Date);
    expect(crmLogCreate).toHaveBeenCalledTimes(1);
    expect(crmLogCreate.mock.calls[0][0].data).toMatchObject({
      event: "new_deal",
      fromStage: null,
      toStage: "contactado",
    });
  });

  it("cambio de stage (transición real): upsert + log stage_changed con fechaEntradaStage actualizada", async () => {
    empresaFindUnique.mockResolvedValue({
      id: 9,
      crmEstado: { dealStage: "contactado" },
    });
    const res = await PATCH(makeReq({ dealStage: "analisis" }), { params: { id: "9" } });
    expect(res.status).toBe(200);
    const upsertArgs = crmEstadoUpsert.mock.calls[0][0];
    expect(upsertArgs.update.dealStage).toBe("analisis");
    expect(upsertArgs.update.fechaEntradaStage).toBeInstanceOf(Date);
    expect(crmLogCreate.mock.calls[0][0].data).toMatchObject({
      event: "stage_changed",
      fromStage: "contactado",
      toStage: "analisis",
    });
  });

  it("mismo stage (no cambio): upsert SIN tocar fechaEntradaStage y SIN log", async () => {
    empresaFindUnique.mockResolvedValue({
      id: 11,
      crmEstado: { dealStage: "analisis" },
    });
    const res = await PATCH(makeReq({ dealStage: "analisis" }), { params: { id: "11" } });
    expect(res.status).toBe(200);
    const upsertArgs = crmEstadoUpsert.mock.calls[0][0];
    expect(upsertArgs.update).toEqual({ dealStage: "analisis" });
    expect(upsertArgs.update).not.toHaveProperty("fechaEntradaStage");
    expect(crmLogCreate).not.toHaveBeenCalled();
  });

  it("entrar a primera_reunion sin URLs previas: dispara auto-create de docs (fire-and-forget)", async () => {
    empresaFindUnique
      // 1ª llamada: el handler chequea existencia y trae crmEstado
      .mockResolvedValueOnce({ id: 13, crmEstado: { dealStage: "contactado" } })
      // 2ª llamada (dentro del autoCreateDocsForFirstMeeting)
      .mockResolvedValueOnce({
        id: 13,
        nombre: "Empresa Test SL",
        oneDriveUrl: null,
        notionUrl: null,
      });
    createEmpresaLinks.mockResolvedValue({
      oneDriveUrl: "https://onedrive/x",
      notionUrl: "https://notion/x",
      folder: { name: "13. Empresa Test" },
    });
    notifyAdmins.mockResolvedValue(undefined);
    empresaUpdate.mockResolvedValue({ id: 13 });

    const res = await PATCH(
      makeReq({ dealStage: "primera_reunion" }),
      { params: { id: "13" } }
    );
    expect(res.status).toBe(200);

    // El side-effect es fire-and-forget; esperamos a que la microtask resuelva.
    await new Promise((r) => setImmediate(r));

    expect(createEmpresaLinks).toHaveBeenCalledWith("Empresa Test SL");
    expect(empresaUpdate).toHaveBeenCalledWith({
      where: { id: 13 },
      data: {
        oneDriveUrl: "https://onedrive/x",
        notionUrl: "https://notion/x",
      },
    });
    expect(notifyAdmins).toHaveBeenCalled();
  });

  it("entrar a primera_reunion con URLs ya pobladas: NO dispara auto-create", async () => {
    empresaFindUnique
      .mockResolvedValueOnce({ id: 14, crmEstado: { dealStage: "contactado" } })
      .mockResolvedValueOnce({
        id: 14,
        nombre: "Ya Linkada SA",
        oneDriveUrl: "https://onedrive/ya",
        notionUrl: "https://notion/ya",
      });

    const res = await PATCH(
      makeReq({ dealStage: "primera_reunion" }),
      { params: { id: "14" } }
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));

    expect(createEmpresaLinks).not.toHaveBeenCalled();
    expect(empresaUpdate).not.toHaveBeenCalled();
  });

  it("falla en createEmpresaLinks: notifica admins con mensaje de error en vez de petar", async () => {
    empresaFindUnique
      .mockResolvedValueOnce({ id: 15, crmEstado: { dealStage: "contactado" } })
      .mockResolvedValueOnce({
        id: 15,
        nombre: "Empresa Falla SL",
        oneDriveUrl: null,
        notionUrl: null,
      });
    createEmpresaLinks.mockRejectedValue(new Error("Graph API down"));
    notifyAdmins.mockResolvedValue(undefined);

    const res = await PATCH(
      makeReq({ dealStage: "primera_reunion" }),
      { params: { id: "15" } }
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));

    // Una llamada al notifyAdmins de error (no la del docs_creados).
    const errorCall = notifyAdmins.mock.calls.find(
      (c) => c[0].tipo === "docs_error"
    );
    expect(errorCall).toBeDefined();
    expect(errorCall![0].mensaje).toContain("Graph API down");
    expect(empresaUpdate).not.toHaveBeenCalled();
  });
});
