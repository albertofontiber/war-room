/**
 * Tests para `cambiarEtapa()` — helper de dominio del cambio de dealStage,
 * extraído de PATCH /api/empresas/[id]/stage y compartido con el tool
 * `cambiar_etapa` del chat IA. Cubre: empresa inexistente, sacar del funnel,
 * entrada nueva al funnel, transición real, no-cambio y side-effect de
 * auto-crear docs al entrar a `primera_reunion`.
 *
 * La capa HTTP (auth, zod, códigos de respuesta) se cubre en
 * src/app/api/empresas/[id]/stage/route.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const empresaFindUnique = vi.fn();
const crmEstadoUpsert = vi.fn();
const crmEstadoDelete = vi.fn();
const crmLogCreate = vi.fn();
const empresaUpdate = vi.fn();
const createEmpresaLinks = vi.fn();
const notifyAdmins = vi.fn();

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

import { cambiarEtapa } from "./crm-stage";

describe("cambiarEtapa", () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    empresaFindUnique.mockReset();
    crmEstadoUpsert.mockReset();
    crmEstadoDelete.mockReset();
    crmLogCreate.mockReset();
    empresaUpdate.mockReset();
    createEmpresaLinks.mockReset();
    notifyAdmins.mockReset();
  });

  it("empresa inexistente → ok: false, empresa_not_found", async () => {
    empresaFindUnique.mockResolvedValue(null);
    const r = await cambiarEtapa({ empresaId: 1, dealStage: "contactado" });
    expect(r).toEqual({ ok: false, error: "empresa_not_found" });
    expect(crmEstadoUpsert).not.toHaveBeenCalled();
    expect(crmLogCreate).not.toHaveBeenCalled();
  });

  it("dealStage=null saca del funnel: borra CrmEstado y loguea removed_from_funnel", async () => {
    empresaFindUnique.mockResolvedValue({
      id: 5,
      crmEstado: { dealStage: "analisis" },
    });
    const r = await cambiarEtapa({
      empresaId: 5,
      dealStage: null,
      note: "Pausa",
      autorId: "user-alberto",
    });
    expect(r).toMatchObject({
      ok: true,
      fromStage: "analisis",
      dealStage: null,
      event: "removed_from_funnel",
    });
    expect(crmEstadoDelete).toHaveBeenCalledWith({ where: { empresaId: 5 } });
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
    const r = await cambiarEtapa({ empresaId: 5, dealStage: null });
    expect(r).toMatchObject({ ok: true, event: "removed_from_funnel" });
    expect(crmEstadoDelete).not.toHaveBeenCalled();
    expect(crmLogCreate).toHaveBeenCalledTimes(1);
  });

  it("nuevo deal (sin CrmEstado previo): upsert + log new_deal + changed: true", async () => {
    empresaFindUnique.mockResolvedValue({ id: 7, crmEstado: null });
    const r = await cambiarEtapa({
      empresaId: 7,
      dealStage: "contactado",
      autorId: "user-alberto",
    });
    expect(r).toMatchObject({
      ok: true,
      fromStage: null,
      dealStage: "contactado",
      changed: true,
      event: "new_deal",
    });
    const upsertArgs = crmEstadoUpsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ empresaId: 7 });
    expect(upsertArgs.create.dealStage).toBe("contactado");
    expect(upsertArgs.create.ownerUserId).toBe("user-alberto");
    expect(upsertArgs.update.fechaEntradaStage).toBeInstanceOf(Date);
    expect(crmLogCreate.mock.calls[0][0].data).toMatchObject({
      event: "new_deal",
      fromStage: null,
      toStage: "contactado",
    });
  });

  it("transición real: upsert con fechaEntradaStage + log stage_changed", async () => {
    empresaFindUnique.mockResolvedValue({
      id: 9,
      crmEstado: { dealStage: "contactado" },
    });
    const r = await cambiarEtapa({ empresaId: 9, dealStage: "analisis" });
    expect(r).toMatchObject({
      ok: true,
      fromStage: "contactado",
      dealStage: "analisis",
      changed: true,
      event: "stage_changed",
    });
    const upsertArgs = crmEstadoUpsert.mock.calls[0][0];
    expect(upsertArgs.update.fechaEntradaStage).toBeInstanceOf(Date);
  });

  it("mismo stage: upsert SIN fechaEntradaStage, SIN log, changed: false", async () => {
    empresaFindUnique.mockResolvedValue({
      id: 11,
      crmEstado: { dealStage: "analisis" },
    });
    const r = await cambiarEtapa({ empresaId: 11, dealStage: "analisis" });
    expect(r).toMatchObject({ ok: true, changed: false, event: null });
    const upsertArgs = crmEstadoUpsert.mock.calls[0][0];
    expect(upsertArgs.update).toEqual({ dealStage: "analisis" });
    expect(crmLogCreate).not.toHaveBeenCalled();
  });

  it("entrar a primera_reunion sin URLs: dispara auto-create de docs (fire-and-forget)", async () => {
    empresaFindUnique
      .mockResolvedValueOnce({ id: 13, crmEstado: { dealStage: "contactado" } })
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

    const r = await cambiarEtapa({ empresaId: 13, dealStage: "primera_reunion" });
    expect(r).toMatchObject({ ok: true, changed: true });

    await new Promise((resolve) => setImmediate(resolve));
    expect(createEmpresaLinks).toHaveBeenCalledWith("Empresa Test SL");
    expect(empresaUpdate).toHaveBeenCalledWith({
      where: { id: 13 },
      data: {
        oneDriveUrl: "https://onedrive/x",
        notionUrl: "https://notion/x",
      },
    });
  });

  it("mismo stage primera_reunion (no cambio): NO dispara auto-create", async () => {
    empresaFindUnique.mockResolvedValue({
      id: 14,
      crmEstado: { dealStage: "primera_reunion" },
    });
    const r = await cambiarEtapa({ empresaId: 14, dealStage: "primera_reunion" });
    expect(r).toMatchObject({ ok: true, changed: false });
    await new Promise((resolve) => setImmediate(resolve));
    expect(createEmpresaLinks).not.toHaveBeenCalled();
  });
});
