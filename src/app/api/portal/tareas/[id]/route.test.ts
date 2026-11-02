import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { tarea: { findFirst: (...args: unknown[]) => findFirst(...args) } } }));
vi.mock("@/lib/finder-session", () => ({ requireCurrentFinder: async () => ({ id: "f1" }) }));
vi.mock("@/lib/notifications", () => ({ notifyAdmins: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ auditLog: vi.fn(), diffFields: vi.fn() }));
vi.mock("@/lib/menciones-server", () => ({ processMenciones: vi.fn() }));
vi.mock("@/lib/finder-access-log", () => ({ logFinderAction: vi.fn() }));

import { DELETE, PATCH } from "./route";

describe("acceso del finder a tareas de empresas asignadas", () => {
  beforeEach(() => { findFirst.mockReset(); findFirst.mockResolvedValue(null); });
  const context = () => ({ params: Promise.resolve({ id: "42" }) });
  const request = { json: async () => ({ completada: true }) } as Parameters<typeof PATCH>[0];

  it("filtra la edición por la empresa que sigue asignada", async () => {
    expect((await PATCH(request, context())).status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ empresa: { finderSourceId: "f1", esAnonima: false } }),
    }));
  });
  it("filtra el borrado por la empresa que sigue asignada", async () => {
    expect((await DELETE(request, context())).status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ empresa: { finderSourceId: "f1", esAnonima: false } }),
    }));
  });
});
