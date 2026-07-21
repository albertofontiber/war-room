import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();
const financieroFindManyMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSessionMock(...args),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financiero: {
      findMany: (...args: unknown[]) => financieroFindManyMock(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/empresas/export-history", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    financieroFindManyMock.mockReset();
    getServerSessionMock.mockResolvedValue({ kind: "admin" });
    financieroFindManyMock.mockResolvedValue([]);
  });

  it("rechaza sesiones anónimas o de finder", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);
    expect((await POST(makeReq({ empresaIds: [1] }))).status).toBe(401);

    getServerSessionMock.mockResolvedValueOnce({ kind: "finder" });
    expect((await POST(makeReq({ empresaIds: [1] }))).status).toBe(401);
    expect(financieroFindManyMock).not.toHaveBeenCalled();
  });

  it("valida que los IDs sean enteros positivos", async () => {
    const response = await POST(makeReq({ empresaIds: [1, -2, 3.5] }));
    expect(response.status).toBe(400);
    expect(financieroFindManyMock).not.toHaveBeenCalled();
  });

  it("no consulta la BD si no hay empresas visibles", async () => {
    const response = await POST(makeReq({ empresaIds: [] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ records: [] });
    expect(financieroFindManyMock).not.toHaveBeenCalled();
  });

  it("deduplica IDs y trae solo ejercicios desde 2020", async () => {
    financieroFindManyMock.mockResolvedValue([
      {
        empresaId: 7,
        anio: 2020,
        ingresos: 100,
        margenBruto: 40,
        ebitda: 15,
      },
    ]);

    const response = await POST(makeReq({ empresaIds: [7, 3, 7] }));
    expect(response.status).toBe(200);
    expect(financieroFindManyMock).toHaveBeenCalledWith({
      where: { empresaId: { in: [7, 3] }, anio: { gte: 2020 } },
      select: {
        empresaId: true,
        anio: true,
        ingresos: true,
        margenBruto: true,
        ebitda: true,
      },
      orderBy: [{ empresaId: "asc" }, { anio: "asc" }],
    });
    expect(await response.json()).toEqual({
      records: [
        {
          empresaId: 7,
          anio: 2020,
          ingresos: 100,
          margenBruto: 40,
          ebitda: 15,
        },
      ],
    });
  });
});
