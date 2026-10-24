import { beforeEach, describe, expect, it, vi } from "vitest";
const sessionMock = vi.fn();
const empresasMock = vi.fn();
const fichaMock = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => sessionMock(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { empresa: { findMany: (...a: unknown[]) => empresasMock(...a), findUnique: (...a: unknown[]) => fichaMock(...a) } } }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn() } }));
import { GET as lite } from "./lite/route";
import { GET as full } from "./route";
import { GET as ficha } from "./[id]/route";

const base = { id: 1, cif: "B12345678", nombre: "PASIVA SL", sector: "PCI", fuente: "investigacion_pasiva_202610", proteccionPasiva: true, ripci: null, lat: 40.4, lng: -3.7, financieros: [], bormeAlertas: [], crmEstado: null, grupo: null, _count: { tareas: 0, bormeAlertas: 0 }, tareas: [] };
describe("APIs de empresa — misma actividad en lite, full y ficha", () => {
  beforeEach(() => {
    sessionMock.mockReset().mockResolvedValue({ kind: "admin" });
    empresasMock.mockReset().mockResolvedValue([base]);
    fichaMock.mockReset().mockResolvedValue(base);
  });
  it("conserva la distinción de alta pasiva en los tres endpoints sin publicar fuente interna", async () => {
    const l = (await (await lite()).json()).features[0].properties;
    expect(empresasMock).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ fuente: true }) }));
    const f = (await (await full()).json()).features[0].properties;
    const d = await (await ficha(new Request("http://localhost/api/empresas/1"), { params: Promise.resolve({ id: "1" }) })).json();
    for (const e of [l, f, d]) {
      expect(e.actividades).toEqual(["pci_pasiva"]);
      expect(e).not.toHaveProperty("fuente");
    }
  });
  it("no añade acceso anónimo al cargar las nuevas actividades", async () => {
    sessionMock.mockResolvedValue(null);
    expect((await lite()).status).toBe(401);
    expect((await full()).status).toBe(401);
    expect(empresasMock).not.toHaveBeenCalled();
  });
});
