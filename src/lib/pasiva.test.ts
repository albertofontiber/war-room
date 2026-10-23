import { describe, expect, it } from "vitest";
import { cumpleFiltroPasiva, estadoPasiva, fusionarEvidenciasPasiva, parseEvidenciasPasiva } from "./pasiva";

const evidencia = { url: "https://empresa.es/pasiva", fuente: "Web corporativa", tipo: "web_corporativa" as const, fecha: "2026-10-23", descripcion: "La empresa ofrece instalación de pasiva." };

describe("Actividad transversal de pasiva", () => {
  it("distingue desconocida, negativa explícita y confirmada", () => {
    expect([true, false, null, undefined].map(estadoPasiva)).toEqual(["confirmada", "descartada", "sin_revisar", "sin_revisar"]);
    expect(cumpleFiltroPasiva(null, ["descartada"])).toBe(false);
    expect(cumpleFiltroPasiva(false, ["sin_revisar"])).toBe(false);
  });
  it("permite combinar estados sin excluir a las empresas posteriores al lote", () => {
    expect(cumpleFiltroPasiva(true, ["confirmada", "sin_revisar"])).toBe(true);
    expect(cumpleFiltroPasiva(null, ["confirmada", "sin_revisar"])).toBe(true);
    expect(cumpleFiltroPasiva(false, ["confirmada", "sin_revisar"])).toBe(false);
    expect(cumpleFiltroPasiva(undefined, [])).toBe(true);
  });
  it("no deja pasar enlaces ejecutables ni evidencias sin fecha válida", () => {
    expect(parseEvidenciasPasiva([evidencia, { ...evidencia, url: "javascript:alert(1)" }, { ...evidencia, fecha: "2026-02-30" }, null])).toEqual([evidencia]);
  });
  it("repetir un lote no duplica evidencias y una fuente nueva no elimina la anterior", () => {
    const union = fusionarEvidenciasPasiva([evidencia], [{ ...evidencia, url: "https://empresa.es/pasiva/" }]);
    expect(union).toHaveLength(1);
    expect(fusionarEvidenciasPasiva(union, [{ ...evidencia, url: "https://asociacion.es/empresa", tipo: "asociacion" }])).toHaveLength(2);
    expect(fusionarEvidenciasPasiva([evidencia], [{ ...evidencia, fecha: "2026-01-01" }])[0].fecha).toBe("2026-10-23");
  });
});
