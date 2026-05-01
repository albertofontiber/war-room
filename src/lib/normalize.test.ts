/**
 * Tests para normalizePersona / normText / bormePersonaToCargoKey.
 *
 * Lógica crítica del proyecto:
 *   - PersonaCargo.nombreNorm depende de normalizePersona(false) para personas
 *     físicas y normalizePersona(true) para empresas. Cualquier cambio rompería
 *     la unicidad de claves y duplicaría registros en BD.
 *   - El dedup de TargetProposal usa normalizePersona(true).
 *   - bormePersonaToCargoKey conecta señales BORME ↔ PersonaCargo.
 */

import { describe, expect, it } from "vitest";
import {
  normalizePersona,
  normText,
  bormePersonaToCargoKey,
  PARTICULAS,
  SUFIJOS_JURIDICOS,
} from "./normalize";

describe("normalizePersona — personas físicas", () => {
  it("ordena tokens alfabéticamente para hacer la clave canónica", () => {
    expect(normalizePersona("David López López")).toBe("DAVID LOPEZ LOPEZ");
    expect(normalizePersona("López López David")).toBe("DAVID LOPEZ LOPEZ");
    // Mismo input en orden distinto debe producir misma clave (canónica).
    const a = normalizePersona("Pablo Pascua Aragón");
    const b = normalizePersona("Aragón Pascua Pablo");
    expect(a).toBe(b);
  });

  it("elimina partículas (DE, DEL, DE LA, etc.)", () => {
    expect(normalizePersona("De La Pascua Aragón Pablo")).toBe("ARAGON PABLO PASCUA");
    expect(normalizePersona("García del Hoyo José")).toBe("GARCIA HOYO JOSE");
  });

  it("elimina tildes y caracteres no alfabéticos", () => {
    expect(normalizePersona("María Ñoño Ávila")).toBe("AVILA MARIA NONO");
    expect(normalizePersona("Pérez-García Juan")).toBe("GARCIA JUAN PEREZ");
  });

  it("convierte guiones en espacios (no se pierden tokens)", () => {
    // "Luis-Roberto" → "LUIS ROBERTO" (dos tokens)
    expect(normalizePersona("Luis-Roberto Méndez")).toBe("LUIS MENDEZ ROBERTO");
  });

  it("ignora puntuación y signos (se eliminan, no se reemplazan por espacio)", () => {
    expect(normalizePersona("García, Juan.")).toBe("GARCIA JUAN");
    // El apóstrofe se elimina sin más → "O'Connor" → "OConnor" → "OCONNOR".
    // (Si quisiera separar, habría que añadirlo a la lista de chars-a-espacio.)
    expect(normalizePersona("O'Connor Sean")).toBe("OCONNOR SEAN");
  });

  it("string vacío o solo espacios → string vacío", () => {
    expect(normalizePersona("")).toBe("");
    expect(normalizePersona("   ")).toBe("");
    expect(normalizePersona(",;.")).toBe("");
  });

  it("PARTICULAS export incluye los conectores castellanos básicos", () => {
    for (const p of ["DE", "DEL", "LA", "LOS", "LAS", "EL", "Y"]) {
      expect(PARTICULAS.has(p)).toBe(true);
    }
  });
});

describe("normalizePersona — personas jurídicas (empresas)", () => {
  it("elimina sufijo mercantil y mantiene orden de tokens", () => {
    expect(normalizePersona("GRUFAEM SL", true)).toBe("GRUFAEM");
    expect(normalizePersona("Cobra Instalaciones y Servicios, S.A.", true))
      .toBe("COBRA INSTALACIONES Y SERVICIOS");
  });

  it("acepta variantes del sufijo (S.L.U, SLU, S.L., SL, S.A.U., SA…)", () => {
    expect(normalizePersona("Empresa Ejemplo S.L.U.", true)).toBe("EMPRESA EJEMPLO");
    expect(normalizePersona("Empresa Ejemplo SLU", true)).toBe("EMPRESA EJEMPLO");
    expect(normalizePersona("Empresa Ejemplo S.A.", true)).toBe("EMPRESA EJEMPLO");
    expect(normalizePersona("Empresa Ejemplo SA", true)).toBe("EMPRESA EJEMPLO");
    expect(normalizePersona("Empresa Ejemplo S.A.U.", true)).toBe("EMPRESA EJEMPLO");
    expect(normalizePersona("Empresa Ejemplo S.COOP.", true)).toBe("EMPRESA EJEMPLO");
  });

  it("conserva el orden de tokens (NO ordena alfabéticamente)", () => {
    // "Cobra Instalaciones" ≠ "Instalaciones Cobra" — son empresas distintas.
    const a = normalizePersona("Cobra Instalaciones SL", true);
    const b = normalizePersona("Instalaciones Cobra SL", true);
    expect(a).not.toBe(b);
    expect(a).toBe("COBRA INSTALACIONES");
    expect(b).toBe("INSTALACIONES COBRA");
  });

  it("conserva números (a diferencia de personas físicas)", () => {
    // SUFIJOS_JURIDICOS solo strip al final; los números internos sobreviven.
    expect(normalizePersona("Sief 2 SL", true)).toBe("SIEF 2");
    expect(normalizePersona("Empresa 24/7 SL", true)).toBe("EMPRESA 247");
  });

  it("elimina tildes y normaliza espacios", () => {
    expect(normalizePersona("Andalufuego  Producción S.L.", true))
      .toBe("ANDALUFUEGO PRODUCCION");
  });

  it("SUFIJOS_JURIDICOS regex case-insensitive", () => {
    expect(SUFIJOS_JURIDICOS.test("Empresa sl")).toBe(true);
    expect(SUFIJOS_JURIDICOS.test("Empresa SA")).toBe(true);
    expect(SUFIJOS_JURIDICOS.test("Empresa s.l.u.")).toBe(true);
  });
});

describe("normText (texto libre BORME)", () => {
  it("NO ordena tokens (búsqueda como substring)", () => {
    expect(normText("Guitard Maldonado, Álvaro")).toBe("GUITARD MALDONADO ALVARO");
    // Distinto de normalizePersona que ordenaría: "ALVARO GUITARD MALDONADO".
  });

  it("NO filtra partículas (a diferencia de normalizePersona)", () => {
    expect(normText("José de la Vega")).toBe("JOSE DE LA VEGA");
  });

  it("conserva números", () => {
    expect(normText("Anuncio 1234/567")).toBe("ANUNCIO 1234 567");
  });

  it("colapsa espacios múltiples", () => {
    expect(normText("Mucho   espacio    aquí")).toBe("MUCHO ESPACIO AQUI");
  });
});

describe("bormePersonaToCargoKey", () => {
  it("convierte un nombre BORME al formato canónico de PersonaCargo", () => {
    // "GUITARD MALDONADO ALVARO" (orden BORME) → "ALVARO GUITARD MALDONADO" (canónico).
    expect(bormePersonaToCargoKey("GUITARD MALDONADO ALVARO"))
      .toBe("ALVARO GUITARD MALDONADO");
  });

  it("aplica la normalización de personas físicas (con orden alfabético)", () => {
    expect(bormePersonaToCargoKey("Pablo Pascua Aragón"))
      .toBe(normalizePersona("Pablo Pascua Aragón"));
  });
});
