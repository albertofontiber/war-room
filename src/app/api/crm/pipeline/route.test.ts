import { beforeEach, describe, expect, it, vi } from "vitest";
const sessionMock = vi.fn();
const empresasMock = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => sessionMock(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { empresa: { findMany: (...a: unknown[]) => empresasMock(...a) } } }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn() } }));
import { GET } from "./route";
const request = (q = "") => ({ url: "http://localhost/api/crm/pipeline" + q }) as Parameters<typeof GET>[0];
const fixture = (id: number, sector: string, pasiva: boolean | null, fuente = "ripci") => ({ id, sector, fuente, proteccionPasiva: pasiva, ripci: null, nombre: "EMPRESA " + id, cif: "B" + id, ccaa: "Madrid", provincia: "Madrid", web: null, esAnonima: false, financieros: [], tareas: [], _count: { tareas: 0 }, crmEstado: { dealStage: "identificado", fechaEntradaStage: null }, grupo: null, finderSource: null });

describe("GET pipeline — actividades combinables", () => {
  beforeEach(() => {
    sessionMock.mockReset().mockResolvedValue({ kind: "admin" });
    empresasMock.mockReset().mockResolvedValue([
      fixture(1, "PCI", null), fixture(2, "PCI", true), fixture(3, "mixto", true),
      fixture(4, "seguridad_electronica", null), fixture(5, "PCI", true, "investigacion_pasiva_202610"),
    ]);
  });
  it("rechaza acceso anónimo y parámetros no reconocidos antes de consultar", async () => {
    sessionMock.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("?actividades=mixto"))).status).toBe(400);
    expect((await GET(request("?actividadesModo=inventado"))).status).toBe(400);
    expect(empresasMock).not.toHaveBeenCalled();
  });
  it("exige las tres actividades por defecto y cuenta solo las tarjetas que pasan", async () => {
    const data = await (await GET(request("?actividades=pci_activa,pci_pasiva,seguridad_electronica"))).json();
    expect(data.total).toBe(1);
    expect(data.counts.identificado).toBe(1);
    expect(data.grouped.identificado.map((e: { id: number }) => e.id)).toEqual([3]);
    expect(data.grouped.identificado[0].actividades).toEqual(["pci_activa", "pci_pasiva", "seguridad_electronica"]);
  });
  it("cualquiera incluye quien hace una de ellas, también pasiva sin activa", async () => {
    const data = await (await GET(request("?actividades=pci_pasiva,seguridad_electronica&actividadesModo=cualquiera"))).json();
    expect(data.total).toBe(4);
    expect(data.grouped.identificado.map((e: { id: number }) => e.id)).toEqual([2, 3, 4, 5]);
  });
  it("no pierde filtros previos de perímetro, CRM, territorio o sector heredado", async () => {
    await GET(request("?ccaa=Madrid&provincia=Madrid&sector=PCI&actividades=pci_pasiva&conTarea=true"));
    expect(empresasMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      enPerimetro: true, ccaa: { in: ["Madrid"] }, provincia: { in: ["Madrid"] }, sector: { in: ["PCI"] },
      crmEstado: { dealStage: { not: null } }, tareas: { some: { completada: false } },
    }) }));
  });
});
