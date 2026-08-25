/**
 * Tests para PATCH /api/tareas/[id], centrados en mover una tarea de ficha
 * (`empresaId`). El resto de campos ya se cubrían por uso; lo que se prueba
 * aquí son las reglas que solo existen para el traslado:
 *   - 404 si la tarea no existe (antes reventaba con un 500 de Prisma)
 *   - la empresa destino tiene que existir y no ser un lead anónimo
 *   - repetir el empresaId actual no cuenta como movimiento
 *   - el finder asignado se cae si el destino no es target suyo
 *
 * Prisma, sesión y side-effects van mockeados: es un test del handler.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.fn();
const userFindUnique = vi.fn();
const tareaFindUnique = vi.fn();
const tareaUpdate = vi.fn();
const empresaFindUnique = vi.fn();
const auditLogMock = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: () => sessionMock() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    tarea: {
      findUnique: (...a: unknown[]) => tareaFindUnique(...a),
      update: (...a: unknown[]) => tareaUpdate(...a),
    },
    empresa: { findUnique: (...a: unknown[]) => empresaFindUnique(...a) },
  },
}));
// diffFields es lógica real (queremos comprobar qué se audita); solo se
// intercepta el envío.
vi.mock("@/lib/audit-log", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit-log")>("@/lib/audit-log");
  return { ...actual, auditLog: (...a: unknown[]) => auditLogMock(...a) };
});
vi.mock("@/lib/email-finder-assignment", () => ({
  sendFinderTaskAssignedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/menciones-server", () => ({
  processMenciones: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH } from "./route";

const EMPRESA_ORIGEN = 1533;
const EMPRESA_DESTINO = 1934;

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0];
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function tareaPrev(over: Record<string, unknown> = {}) {
  return {
    tipo: "mensaje_whatsapp",
    titulo: "Escribir a Marc Viñolas",
    descripcion: null,
    resultado: null,
    fechaLimite: null,
    completada: false,
    empresaId: EMPRESA_ORIGEN,
    asignadoId: null,
    asignadoFinderId: null,
    ...over,
  };
}

/** Lo que devuelve el update — refleja el `data` que se le pasó. */
function tareaActualizada(over: Record<string, unknown> = {}) {
  return {
    id: 842,
    ...tareaPrev(),
    empresaId: EMPRESA_DESTINO,
    autor: null,
    asignado: null,
    asignadoFinder: null,
    empresa: { id: EMPRESA_DESTINO, nombre: "EXTINTORS GIROFOC SL" },
    ...over,
  };
}

describe("PATCH /api/tareas/[id] — mover de empresa", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    userFindUnique.mockReset();
    tareaFindUnique.mockReset();
    tareaUpdate.mockReset();
    empresaFindUnique.mockReset();
    auditLogMock.mockReset();

    sessionMock.mockResolvedValue({ kind: "admin", user: { email: "alberto@fontiber.com" } });
    userFindUnique.mockResolvedValue({ id: "u-alberto", name: "Alberto", email: "alberto@fontiber.com", role: "admin" });
    tareaFindUnique.mockResolvedValue(tareaPrev());
    tareaUpdate.mockResolvedValue(tareaActualizada());
    empresaFindUnique.mockResolvedValue({
      id: EMPRESA_DESTINO, esAnonima: false, finderSourceId: null,
    });
  });

  it("mueve la tarea a la empresa destino", async () => {
    const res = await PATCH(makeReq({ empresaId: EMPRESA_DESTINO }), ctx("842"));
    expect(res.status).toBe(200);
    expect(tareaUpdate).toHaveBeenCalledTimes(1);
    expect(tareaUpdate.mock.calls[0][0].data.empresaId).toBe(EMPRESA_DESTINO);
  });

  it("deja constancia del traslado en la auditoría", async () => {
    await PATCH(makeReq({ empresaId: EMPRESA_DESTINO }), ctx("842"));
    expect(auditLogMock).toHaveBeenCalledTimes(1);
    const entry = auditLogMock.mock.calls[0][0];
    expect(entry.entityType).toBe("tarea");
    expect(entry.before.empresaId).toBe(EMPRESA_ORIGEN);
    expect(entry.after.empresaId).toBe(EMPRESA_DESTINO);
  });

  it("devuelve 404 si la tarea no existe", async () => {
    tareaFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeReq({ titulo: "x" }), ctx("999"));
    expect(res.status).toBe(404);
    expect(tareaUpdate).not.toHaveBeenCalled();
  });

  it("devuelve 400 si la empresa destino no existe", async () => {
    empresaFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeReq({ empresaId: 99999 }), ctx("842"));
    expect(res.status).toBe(400);
    expect(tareaUpdate).not.toHaveBeenCalled();
  });

  it("devuelve 400 si la empresa destino es un lead anónimo", async () => {
    empresaFindUnique.mockResolvedValue({ id: 7, esAnonima: true, finderSourceId: null });
    const res = await PATCH(makeReq({ empresaId: 7 }), ctx("842"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No se puede mover una tarea a un lead anónimo" });
    expect(tareaUpdate).not.toHaveBeenCalled();
  });

  it("no cuenta como movimiento repetir el empresaId actual", async () => {
    tareaUpdate.mockResolvedValue(tareaActualizada({ empresaId: EMPRESA_ORIGEN, empresa: { id: EMPRESA_ORIGEN, nombre: "SEGURIFOC, SL" } }));
    const res = await PATCH(makeReq({ empresaId: EMPRESA_ORIGEN }), ctx("842"));
    expect(res.status).toBe(200);
    expect(empresaFindUnique).not.toHaveBeenCalled();
    expect(tareaUpdate.mock.calls[0][0].data).not.toHaveProperty("empresaId");
  });

  it("quita el finder asignado si el destino no es target suyo", async () => {
    tareaFindUnique.mockResolvedValue(tareaPrev({ asignadoFinderId: "f-1" }));
    empresaFindUnique.mockResolvedValue({ id: EMPRESA_DESTINO, esAnonima: false, finderSourceId: "f-otro" });
    await PATCH(makeReq({ empresaId: EMPRESA_DESTINO }), ctx("842"));
    expect(tareaUpdate.mock.calls[0][0].data.asignadoFinderId).toBeNull();
  });

  it("mantiene el finder si el destino sí es target suyo", async () => {
    tareaFindUnique.mockResolvedValue(tareaPrev({ asignadoFinderId: "f-1" }));
    empresaFindUnique.mockResolvedValue({ id: EMPRESA_DESTINO, esAnonima: false, finderSourceId: "f-1" });
    await PATCH(makeReq({ empresaId: EMPRESA_DESTINO }), ctx("842"));
    expect(tareaUpdate.mock.calls[0][0].data).not.toHaveProperty("asignadoFinderId");
  });

  it("respeta un cambio de finder que venga en el mismo PATCH", async () => {
    // Reasignar a f-2 y mover a una ficha que no es suya → se cae igual.
    tareaFindUnique.mockResolvedValue(tareaPrev({ asignadoFinderId: "f-1" }));
    empresaFindUnique.mockResolvedValue({ id: EMPRESA_DESTINO, esAnonima: false, finderSourceId: "f-1" });
    await PATCH(makeReq({ empresaId: EMPRESA_DESTINO, asignadoFinderId: "f-2" }), ctx("842"));
    expect(tareaUpdate.mock.calls[0][0].data.asignadoFinderId).toBeNull();
  });

  it("exige sesión de admin", async () => {
    sessionMock.mockResolvedValue({ kind: "finder", user: { email: "f@x.com" } });
    const res = await PATCH(makeReq({ empresaId: EMPRESA_DESTINO }), ctx("842"));
    expect(res.status).toBe(401);
    expect(tareaUpdate).not.toHaveBeenCalled();
  });
});
