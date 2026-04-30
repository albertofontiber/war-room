import { describe, expect, it } from "vitest";
import {
  TareaCreateSchema,
  TareaUpdateSchema,
  NotaCreateSchema,
  StageChangeSchema,
  FinderAssignSchema,
  PerimetroPatchSchema,
  LeadLinkSchema,
  FinderSetPasswordSchema,
  PortalNotaCreateSchema,
  PortalTareaCreateSchema,
  PortalTareaUpdateSchema,
  ProposalCreateSchema,
  ProposalReviewSchema,
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

  it("acepta todos los tipos válidos (incluye email tras fusión Tarea+Actividad)", () => {
    for (const t of [
      "contacto_linkedin",
      "mensaje_whatsapp",
      "llamada",
      "videollamada",
      "reunion_presencial",
      "email",
      "otra",
    ]) {
      const r = TareaCreateSchema.safeParse({ titulo: "x", tipo: t });
      expect(r.success, `tipo=${t}`).toBe(true);
    }
  });

  it("acepta completada=true + resultado en create (formulario 'Ya hecho')", () => {
    const r = TareaCreateSchema.safeParse({
      titulo: "Llamada",
      completada: true,
      resultado: "Hablamos del próximo paso, manda email el viernes",
    });
    expect(r.success).toBe(true);
  });

  it("acepta fechaLimite en formato yyyy-mm-dd (HTML date input)", () => {
    const r = TareaCreateSchema.safeParse({ titulo: "x", fechaLimite: "2026-04-29" });
    expect(r.success).toBe(true);
  });

  it("acepta fechaLimite en ISO 8601 con offset", () => {
    const r = TareaCreateSchema.safeParse({ titulo: "x", fechaLimite: "2026-04-29T10:00:00+02:00" });
    expect(r.success).toBe(true);
  });

  it("acepta fechaLimite vacía o null", () => {
    expect(TareaCreateSchema.safeParse({ titulo: "x", fechaLimite: "" }).success).toBe(true);
    expect(TareaCreateSchema.safeParse({ titulo: "x", fechaLimite: null }).success).toBe(true);
  });

  it("rechaza fechaLimite con formato distinto (dd/mm/yyyy, etc.)", () => {
    expect(TareaCreateSchema.safeParse({ titulo: "x", fechaLimite: "29/04/2026" }).success).toBe(false);
    expect(TareaCreateSchema.safeParse({ titulo: "x", fechaLimite: "2026-04" }).success).toBe(false);
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

describe("LeadLinkSchema", () => {
  it("acepta targetEmpresaId entero positivo", () => {
    expect(LeadLinkSchema.safeParse({ targetEmpresaId: 42 }).success).toBe(true);
  });

  it("rechaza targetEmpresaId ausente", () => {
    expect(LeadLinkSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza targetEmpresaId 0 o negativo", () => {
    expect(LeadLinkSchema.safeParse({ targetEmpresaId: 0 }).success).toBe(false);
    expect(LeadLinkSchema.safeParse({ targetEmpresaId: -5 }).success).toBe(false);
  });

  it("rechaza targetEmpresaId no entero", () => {
    expect(LeadLinkSchema.safeParse({ targetEmpresaId: 1.5 }).success).toBe(false);
    expect(LeadLinkSchema.safeParse({ targetEmpresaId: "42" }).success).toBe(false);
  });
});

describe("FinderSetPasswordSchema", () => {
  it("acepta password de 10+ caracteres", () => {
    expect(FinderSetPasswordSchema.safeParse({ password: "abcdefghij" }).success).toBe(true);
    expect(FinderSetPasswordSchema.safeParse({ password: "unaContraseñaLargaYsegura" }).success).toBe(true);
  });

  it("rechaza password corta", () => {
    expect(FinderSetPasswordSchema.safeParse({ password: "corta" }).success).toBe(false);
    expect(FinderSetPasswordSchema.safeParse({ password: "123456789" }).success).toBe(false);
  });

  it("rechaza body sin password", () => {
    expect(FinderSetPasswordSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza password no string", () => {
    expect(FinderSetPasswordSchema.safeParse({ password: 1234567890 }).success).toBe(false);
  });
});

describe("PortalNotaCreateSchema", () => {
  it("acepta contenido válido", () => {
    expect(PortalNotaCreateSchema.safeParse({ contenido: "Primera llamada OK" }).success).toBe(true);
  });
  it("rechaza contenido vacío o espacios", () => {
    expect(PortalNotaCreateSchema.safeParse({ contenido: "" }).success).toBe(false);
    expect(PortalNotaCreateSchema.safeParse({ contenido: "   " }).success).toBe(false);
  });
});

describe("PortalTareaCreateSchema", () => {
  it("acepta body mínimo con título", () => {
    const r = PortalTareaCreateSchema.safeParse({ titulo: "Llamar al fundador" });
    expect(r.success).toBe(true);
  });
  it("rechaza sin título", () => {
    expect(PortalTareaCreateSchema.safeParse({}).success).toBe(false);
  });
  it("acepta fechaLimite ISO", () => {
    const r = PortalTareaCreateSchema.safeParse({
      titulo: "x",
      fechaLimite: "2026-05-01T00:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });
});

describe("PortalTareaUpdateSchema", () => {
  it("acepta toggle completada solo", () => {
    expect(PortalTareaUpdateSchema.safeParse({ completada: true }).success).toBe(true);
  });
  it("rechaza body vacío", () => {
    expect(PortalTareaUpdateSchema.safeParse({}).success).toBe(false);
  });
  it("acepta resultado solo (notas post-evento)", () => {
    expect(PortalTareaUpdateSchema.safeParse({ resultado: "salió bien" }).success).toBe(true);
  });
  it("acepta resultado=null para limpiar", () => {
    expect(PortalTareaUpdateSchema.safeParse({ resultado: null }).success).toBe(true);
  });
});

describe("PortalTareaCreateSchema (modo 'Ya hecho')", () => {
  it("acepta completada=true + resultado", () => {
    const r = PortalTareaCreateSchema.safeParse({
      titulo: "Llamada",
      tipo: "llamada",
      completada: true,
      resultado: "Hablamos del precio",
    });
    expect(r.success).toBe(true);
  });
  it("acepta tipo email (nuevo tras fusión Actividad)", () => {
    const r = PortalTareaCreateSchema.safeParse({ titulo: "x", tipo: "email" });
    expect(r.success).toBe(true);
  });
});

describe("ProposalCreateSchema", () => {
  it("acepta con solo companyName", () => {
    expect(ProposalCreateSchema.safeParse({ companyName: "Fire Targets SL" }).success).toBe(true);
  });
  it("acepta con todos los campos", () => {
    const r = ProposalCreateSchema.safeParse({
      companyName: "Target X",
      cif: "B12345678",
      website: "https://target.com",
      contactName: "Juan",
      contactRole: "CEO",
      notes: "Muy interesante",
    });
    expect(r.success).toBe(true);
  });
  it("rechaza sin companyName", () => {
    expect(ProposalCreateSchema.safeParse({}).success).toBe(false);
    expect(ProposalCreateSchema.safeParse({ companyName: "   " }).success).toBe(false);
  });
});

describe("ProposalReviewSchema", () => {
  it("acepta status válidos", () => {
    for (const s of ["PENDING", "ACCEPTED", "DUPLICATE", "OUT_OF_SCOPE", "REJECTED"]) {
      expect(ProposalReviewSchema.safeParse({ status: s }).success, `status=${s}`).toBe(true);
    }
  });
  it("rechaza status inventado", () => {
    expect(ProposalReviewSchema.safeParse({ status: "PENDIENTE" }).success).toBe(false);
  });
  it("acepta empresaId vinculado en ACCEPTED", () => {
    const r = ProposalReviewSchema.safeParse({ status: "ACCEPTED", empresaId: 42 });
    expect(r.success).toBe(true);
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
