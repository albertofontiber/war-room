import { describe, expect, it } from "vitest";
import { FilaPasivaSchema, planificarPasiva, type EmpresaParaPasiva } from "./pasiva-import";

const fila = FilaPasivaSchema.parse({ cif: "A-19199892", nombre: "Control Ignífugo Soluciones Avanzadas SA", web: "https://www.controlignifugo.es/", identidadUrl: "https://www.controlignifugo.es/aviso-legal/", identidadMetodo: "aviso_legal", permitirAlta: true, localidad: "Leganés", provincia: "Madrid", ccaa: "Madrid", lat: 40.32, lng: -3.76, evidencias: [{ url: "https://www.controlignifugo.es/", fuente: "Web corporativa", tipo: "web_corporativa", fecha: "2026-10-23", descripcion: "Instala protección pasiva." }] });
const empresa: EmpresaParaPasiva = { id: 1, cif: "A19199892", nombre: "CONTROL IGNIFUGO SA", web: "http://controlignifugo.es", esAnonima: false, proteccionPasiva: null, pasivaServicios: [], pasivaEvidencias: null, pasivaRevisadaAt: null };

describe("Plan de alta y enriquecimiento", () => {
  it("enriquece por CIF normalizado y solo propone campos de actividad", () => {
    const p = planificarPasiva([fila], [{ ...empresa, cif: "A-19199892" }])[0];
    expect(p.accion).toBe("enriquecer");
    if (p.accion === "revisar") throw new Error(p.motivo);
    expect(Object.keys(p.cambios).sort()).toEqual(["pasivaEvidencias", "pasivaRevisadaAt", "pasivaServicios", "proteccionPasiva"]);
  });
  it("no da de alta el mismo dominio con otro CIF sin resolver identidad", () => {
    expect(planificarPasiva([fila], [{ ...empresa, cif: "B12345678" }])[0].accion).toBe("revisar");
    expect(planificarPasiva([fila, { ...fila, cif: "B12345678", nombre: "Otra sociedad SL" }], [])[1].accion).toBe("revisar");
  });
  it("impide alta sin localización, sin validación fiscal o sin permiso del lote", () => {
    expect(planificarPasiva([{ ...fila, lat: undefined }], [])[0].accion).toBe("revisar");
    expect(planificarPasiva([{ ...fila, identidadMetodo: "universo_cif_dominio" }], [])[0].accion).toBe("revisar");
    expect(planificarPasiva([{ ...fila, permitirAlta: false }], [])[0].accion).toBe("revisar");
    expect(planificarPasiva([fila], [])[0].accion).toBe("alta");
  });
  it("no pisa revisiones negativas ni leads anónimos", () => {
    expect(planificarPasiva([fila], [{ ...empresa, proteccionPasiva: false }])[0].accion).toBe("revisar");
    expect(planificarPasiva([fila], [{ ...empresa, esAnonima: true }])[0].accion).toBe("revisar");
  });
  it("un segundo import es idempotente", () => {
    const p = planificarPasiva([fila], [empresa])[0];
    if (p.accion === "revisar") throw new Error(p.motivo);
    const segunda = planificarPasiva([fila], [{ ...empresa, ...p.cambios }])[0];
    expect(segunda.accion).toBe("sin_cambios");
  });
  it("completa únicamente datos vacíos con fuente fiscal y no pisa localización conocida", () => {
    const f = { ...fila, completarVacios: true, direccion: "Dirección contrastada", codigoPostal: "28919" };
    const e = { ...empresa, web: null, localidad: null, provincia: "Provincia guardada", ccaa: "Comunidad guardada", lat: null, lng: null };
    const p = planificarPasiva([f], [e])[0];
    if (p.accion === "revisar") throw new Error(p.motivo);
    expect(p.cambios).toMatchObject({ web: fila.web, localidad: fila.localidad, lat: fila.lat, lng: fila.lng, direccion: f.direccion });
    expect(p.cambios).not.toHaveProperty("provincia");
    expect(p.cambios).not.toHaveProperty("ccaa");
    expect(planificarPasiva([f], [{ ...e, ...p.cambios }])[0].accion).toBe("sin_cambios");
    expect(planificarPasiva([{ ...f, identidadMetodo: "universo_cif_dominio" }], [e])[0].accion).toBe("revisar");
  });
  it("bloquea ambigüedades de CIF y filas repetidas", () => {
    expect(planificarPasiva([fila], [empresa, { ...empresa, id: 2 }])[0].accion).toBe("revisar");
    expect(() => planificarPasiva([fila, fila], [])).toThrow("CIF repetido");
  });
});
