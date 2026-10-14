import { describe, expect, it } from "vitest";
import { clasificarMovimientos, type AlertaGrupo } from "./grupo-movimientos";

const G = 7;
let nextId = 1;

function alerta(
  p: Partial<Omit<AlertaGrupo, "fecha">> & { empresaId: number; fecha: string; tipoActo: string }
): AlertaGrupo {
  return {
    id: nextId++,
    empresaNombre: `Empresa ${p.empresaId}`,
    empresaGrupoId: G,
    descripcion: null,
    grupoInferidoId: null,
    ...p,
    fecha: new Date(p.fecha),
  };
}

const DESDE = new Date("2026-04-15");
const HASTA = new Date("2026-10-15");

describe("clasificarMovimientos", () => {
  it("cuenta como entrada la empresa cuya primera señal de grupo cae en el periodo", () => {
    const r = clasificarMovimientos({
      grupoId: G,
      alertas: [alerta({ empresaId: 1, fecha: "2026-09-28", tipoActo: "nombramiento_grupo", grupoInferidoId: G })],
      miembros: [{ id: 1, nombre: "Empresa 1" }],
      desde: DESDE,
      hasta: HASTA,
    });
    expect(r.entradas.map((e) => e.empresaId)).toEqual([1]);
    expect(r.entradas[0].fechaEntrada).toBe("2026-09-28");
    expect(r.anteriores).toEqual([]);
    expect(r.miembrosSinSenal).toEqual([]);
  });

  it("una empresa vinculada antes del periodo va a anteriores, y sus actos del periodo a otrosActos", () => {
    const r = clasificarMovimientos({
      grupoId: G,
      alertas: [
        alerta({ empresaId: 2, fecha: "2025-09-16", tipoActo: "adquisicion", grupoInferidoId: G }),
        alerta({ empresaId: 2, fecha: "2026-07-02", tipoActo: "cambio_denominacion", grupoInferidoId: G }),
        alerta({ empresaId: 2, fecha: "2026-07-03", tipoActo: "nombramiento", grupoInferidoId: G }),
      ],
      miembros: [{ id: 2, nombre: "Empresa 2" }],
      desde: DESDE,
      hasta: HASTA,
    });
    expect(r.entradas).toEqual([]);
    expect(r.anteriores).toEqual([
      { empresaId: 2, empresa: "Empresa 2", fechaEntrada: "2025-09-16", enGrupoActualmente: true },
    ]);
    // "nombramiento" es ruido: solo pasa el cambio de denominación.
    expect(r.otrosActos.map((a) => a.tipoActo)).toEqual(["cambio_denominacion"]);
  });

  it("adelanta la entrada a una adquisición previa sin grupo inferido (≤ 90 días)", () => {
    const r = clasificarMovimientos({
      grupoId: G,
      alertas: [
        alerta({
          empresaId: 3,
          fecha: "2026-10-01",
          tipoActo: "adquisicion",
          descripcion: "Declaración de unipersonalidad. Socio único: ATLON TECHNOLOGIES SOCIEDAD LIMITADA. Ceses.",
        }),
        alerta({ empresaId: 3, fecha: "2026-10-07", tipoActo: "posible_adquisicion", grupoInferidoId: G }),
      ],
      miembros: [{ id: 3, nombre: "Empresa 3" }],
      desde: DESDE,
      hasta: HASTA,
    });
    expect(r.entradas[0].fechaEntrada).toBe("2026-10-01");
    expect(r.entradas[0].adquirente).toBe("ATLON TECHNOLOGIES SOCIEDAD LIMITADA");
    expect(r.entradas[0].actos.map((a) => a.tipoActo)).toEqual(["adquisicion", "posible_adquisicion"]);
  });

  it("no adelanta a una adquisición antigua (otro comprador, años antes)", () => {
    const r = clasificarMovimientos({
      grupoId: G,
      alertas: [
        alerta({ empresaId: 4, fecha: "2024-05-01", tipoActo: "adquisicion" }),
        alerta({ empresaId: 4, fecha: "2026-06-01", tipoActo: "nombramiento_grupo", grupoInferidoId: G }),
      ],
      miembros: [{ id: 4, nombre: "Empresa 4" }],
      desde: DESDE,
      hasta: HASTA,
    });
    expect(r.entradas[0].fechaEntrada).toBe("2026-06-01");
  });

  it("marca como dudosa la empresa vinculada por el BORME pero no asignada al grupo", () => {
    const r = clasificarMovimientos({
      grupoId: G,
      alertas: [
        alerta({ empresaId: 5, empresaGrupoId: null, fecha: "2026-05-01", tipoActo: "adquisicion", grupoInferidoId: G }),
      ],
      miembros: [],
      desde: DESDE,
      hasta: HASTA,
    });
    expect(r.entradas[0].enGrupoActualmente).toBe(false);
  });

  it("los miembros sin ninguna señal de grupo quedan con fecha desconocida", () => {
    const r = clasificarMovimientos({
      grupoId: G,
      alertas: [alerta({ empresaId: 6, fecha: "2026-07-02", tipoActo: "cambio_denominacion" })],
      miembros: [
        { id: 6, nombre: "Empresa 6" },
        { id: 8, nombre: "Empresa 8" },
      ],
      desde: DESDE,
      hasta: HASTA,
    });
    expect(r.miembrosSinSenal.map((m) => m.id)).toEqual([6, 8]);
    // Su cambio de denominación sí se reporta.
    expect(r.otrosActos.map((a) => a.empresaId)).toEqual([6]);
  });

  it("sin desde = todo el histórico; vinculadas después de hasta no cuentan", () => {
    const alertas = [
      alerta({ empresaId: 9, fecha: "2024-06-01", tipoActo: "adquisicion", grupoInferidoId: G }),
      alerta({ empresaId: 10, fecha: "2026-12-01", tipoActo: "adquisicion", grupoInferidoId: G }),
    ];
    const r = clasificarMovimientos({ grupoId: G, alertas, miembros: [], desde: null, hasta: HASTA });
    expect(r.entradas.map((e) => e.empresaId)).toEqual([9]);
    expect(r.anteriores).toEqual([]);
  });
});
