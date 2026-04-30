import { describe, expect, it } from "vitest";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_COLOR,
  DEAL_STAGE_TEXT_CLASS,
  DEAL_STAGE_PILL_CLASS,
  FUNNEL_STAGES,
  SIDE_STAGES,
  TERMINAL_STAGES,
  FINDER_STATUS_MAP,
  isValidDealStage,
  isValidTareaTipo,
  diasDesde,
  ESTANCADO_DIAS,
} from "./crm";

describe("DEAL_STAGES integrity", () => {
  it("los 4 maps cubren cada stage sin huecos", () => {
    for (const s of DEAL_STAGES) {
      expect(DEAL_STAGE_LABEL[s], `label ${s}`).toBeTruthy();
      expect(DEAL_STAGE_COLOR[s], `color ${s}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(DEAL_STAGE_TEXT_CLASS[s], `text class ${s}`).toContain("text-");
      expect(DEAL_STAGE_PILL_CLASS[s], `pill class ${s}`).toContain("border-");
    }
  });

  it("FUNNEL_STAGES y SIDE_STAGES son disjuntos y cubren todos", () => {
    const union = new Set([...FUNNEL_STAGES, ...SIDE_STAGES]);
    expect(union.size).toBe(DEAL_STAGES.length);
    for (const s of DEAL_STAGES) expect(union.has(s), s).toBe(true);
  });

  it("TERMINAL_STAGES son todos stages válidos", () => {
    for (const s of TERMINAL_STAGES) {
      expect(DEAL_STAGES).toContain(s);
    }
  });

  it("FINDER_STATUS_MAP tiene entrada para cada stage", () => {
    for (const s of DEAL_STAGES) {
      expect(s in FINDER_STATUS_MAP, `missing finder mapping for ${s}`).toBe(true);
    }
  });
});

describe("isValidDealStage", () => {
  it("valida los stages reales", () => {
    for (const s of DEAL_STAGES) expect(isValidDealStage(s)).toBe(true);
  });

  it("rechaza strings inventados y tipos no-string", () => {
    expect(isValidDealStage("NBO")).toBe(false);
    expect(isValidDealStage("prospecto")).toBe(false);
    expect(isValidDealStage("")).toBe(false);
    expect(isValidDealStage(null)).toBe(false);
    expect(isValidDealStage(42)).toBe(false);
  });
});

describe("isValidTareaTipo", () => {
  it("valida tipos reales", () => {
    expect(isValidTareaTipo("llamada")).toBe(true);
    expect(isValidTareaTipo("contacto_linkedin")).toBe(true);
  });

  it("valida 'email' (añadido tras fusión Tarea+Actividad)", () => {
    expect(isValidTareaTipo("email")).toBe(true);
  });

  it("rechaza tipos desconocidos", () => {
    expect(isValidTareaTipo("linkedin")).toBe(false);
    expect(isValidTareaTipo(null)).toBe(false);
  });

  it("rechaza 'nota' (vive en modelo Nota, no en Tarea.tipo)", () => {
    expect(isValidTareaTipo("nota")).toBe(false);
  });
});

describe("diasDesde", () => {
  it("devuelve null para fechas vacías", () => {
    expect(diasDesde(null)).toBeNull();
    expect(diasDesde(undefined)).toBeNull();
    expect(diasDesde("")).toBeNull();
  });

  it("devuelve null para fechas inválidas", () => {
    expect(diasDesde("not-a-date")).toBeNull();
  });

  it("devuelve 0 para hoy", () => {
    expect(diasDesde(new Date())).toBe(0);
  });

  it("devuelve >=N para hace N días", () => {
    const hace10 = new Date();
    hace10.setDate(hace10.getDate() - 10);
    expect(diasDesde(hace10)).toBeGreaterThanOrEqual(9);
    expect(diasDesde(hace10)).toBeLessThanOrEqual(11);
  });

  it("acepta strings ISO", () => {
    const hace5 = new Date();
    hace5.setDate(hace5.getDate() - 5);
    const result = diasDesde(hace5.toISOString());
    expect(result).toBeGreaterThanOrEqual(4);
    expect(result).toBeLessThanOrEqual(6);
  });
});

describe("constantes de negocio", () => {
  it("ESTANCADO_DIAS es un entero positivo razonable", () => {
    expect(Number.isInteger(ESTANCADO_DIAS)).toBe(true);
    expect(ESTANCADO_DIAS).toBeGreaterThan(0);
    expect(ESTANCADO_DIAS).toBeLessThan(180);
  });
});
