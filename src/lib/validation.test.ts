import { describe, expect, it } from "vitest";
import {
  TareaCreateSchema,
  TareaUpdateSchema,
  NotaCreateSchema,
  StageChangeSchema,
  FinderAssignSchema,
  PerimetroPatchSchema,
} from "./validation";

describe("TareaCreateSchema", () => {
  it("acepta un body mínimo con titulo", () => {
    const result = TareaCreateSchema.safeParse({ titulo: "Llamar a Alberto" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.titulo).toBe("Llamar a Alberto");
  });

  it("rechaza bodies sin titulo", () => {
    expect(TareaCreateSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza titulo vacío (sólo espacios)", () => {
    expect(TareaCreateSchema.safeParse({ titulo: "   " }).success).toBe(false);
  });

  it("rechaza tipo desconocido", () => {
    const r = TareaCreateSchema.safeParse({ titulo: "x", tipo: "inventado" });
    expect(r.success).toBe(false);
  });

  it("acepta todos los tipos válidos", () => {
    for (const t of ["contacto_linkedin", "mensaje_whatsapp", "llamada", "videollamada", "reunion_presencial", "otra"]) {
      const r = TareaCreateSchema.safeParse({ titulo: "x", tipo: t });
      expect(r.success, `tipo=${t}`).toBe(true);
    }
  });
});

describe("TareaUpdateSchema", () => {
  it("rechaza body completamente vacío", () => {
    expect(TareaUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("acepta update parcial (solo completada)", () => {
    expect(TareaUpdateSchema.safeParse({ completada: true }).success).toBe(true);
  });

  it("rechaza titulo sólo espacios", () => {
    expect(TareaUpdateSchema.safeParse({ titulo: "  " }).success).toBe(false);
  });
});

describe("NotaCreateSchema", () => {
  it("acepta contenido válido", () => {
    expect(NotaCreateSchema.safeParse({ contenido: "Hola" }).success).toBe(true);
  });

  it("rechaza contenido vacío", () => {
    expect(NotaCreateSchema.safeParse({ contenido: "" }).success).toBe(false);
    expect(NotaCreateSchema.safeParse({ contenido: "   " }).success).toBe(false);
  });
});

describe("StageChangeSchema", () => {
  it("acepta null (salir del funnel)", () => {
    expect(StageChangeSchema.safeParse({ dealStage: null }).success).toBe(true);
  });

  it("acepta los 9 stages", () => {
    for (const s of [
      "identificado", "contactado", "primera_reunion", "analisis",
      "LOI enviada", "execution", "portfolio", "on_hold", "muerto",
    ]) {
      const r = StageChangeSchema.safeParse({ dealStage: s });
      expect(r.success, `stage=${s}`).toBe(true);
    }
  });

  it("rechaza stage inexistente", () => {
    expect(StageChangeSchema.safeParse({ dealStage: "NBO" }).success).toBe(false);
    expect(StageChangeSchema.safeParse({ dealStage: "prospecto" }).success).toBe(false);
  });

  it("acepta note opcional", () => {
    const r = StageChangeSchema.safeParse({ dealStage: "contactado", note: "primera llamada" });
    expect(r.success).toBe(true);
  });
});

describe("FinderAssignSchema", () => {
  it("acepta finderId string", () => {
    expect(FinderAssignSchema.safeParse({ finderId: "abc123" }).success).toBe(true);
  });

  it("acepta null (desasignar)", () => {
    expect(FinderAssignSchema.safeParse({ finderId: null }).success).toBe(true);
  });

  it("rechaza finderId numérico", () => {
    expect(FinderAssignSchema.safeParse({ finderId: 42 }).success).toBe(false);
  });
});

describe("PerimetroPatchSchema", () => {
  it("acepta enPerimetro boolean", () => {
    expect(PerimetroPatchSchema.safeParse({ enPerimetro: true }).success).toBe(true);
    expect(PerimetroPatchSchema.safeParse({ enPerimetro: false }).success).toBe(true);
  });

  it("rechaza truthy non-boolean", () => {
    expect(PerimetroPatchSchema.safeParse({ enPerimetro: "yes" }).success).toBe(false);
    expect(PerimetroPatchSchema.safeParse({ enPerimetro: 1 }).success).toBe(false);
  });
});
