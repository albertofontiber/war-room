import { describe, expect, it } from "vitest";
import {
  cifAppearsInText,
  generateWebsiteCandidates,
  homepageUrl,
  normalizeWebsiteText,
} from "./web-enrichment";

describe("web enrichment helpers", () => {
  it("normaliza texto web sin perder letras ni números relevantes", () => {
    expect(normalizeWebsiteText("Protección & Gestión, S.L.")).toBe("PROTECCION GESTION S L");
  });

  it("encuentra el CIF aunque la web use guiones o espacios", () => {
    expect(cifAppearsInText("B12345678", "CIF: B-12345678")).toBe(true);
    expect(cifAppearsInText("B12345678", "CIF: B 12345679")).toBe(false);
    expect(cifAppearsInText("B12345678", "CIF: B123456789")).toBe(false);
  });

  it("genera candidatos con el nombre distintivo y elimina los sufijos mercantiles", () => {
    const candidates = generateWebsiteCandidates("Tratein PCI Instalaciones, S.L.");
    expect(candidates).toContain("https://trateinpci.es/");
    expect(candidates).not.toContain("https://trateinpcisl.es/");
  });

  it("reduce una URL validada a la portada canónica", () => {
    expect(homepageUrl("https://www.ejemplo.es/aviso-legal?ref=1")).toBe("https://www.ejemplo.es/");
    expect(homepageUrl("ftp://ejemplo.es/")).toBeNull();
  });
});
