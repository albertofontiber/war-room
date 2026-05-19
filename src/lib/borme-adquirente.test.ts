import { describe, it, expect } from "vitest";
import { extractAdquirente, looksLikeCompanyName } from "./borme-adquirente";

describe("looksLikeCompanyName", () => {
  it("rechaza strings demasiado cortos", () => {
    expect(looksLikeCompanyName("")).toBe(false);
    expect(looksLikeCompanyName("AB")).toBe(false);
    expect(looksLikeCompanyName("ABC")).toBe(false);
  });

  it("rechaza etiquetas BORME comunes que confunden con nombres", () => {
    // Caso real reportado: "Ceses/Dimisiones" aparecía como adquirente
    // de ALMANA INGENIERIA tras "Unipersonalidad."
    expect(looksLikeCompanyName("Ceses/Dimisiones")).toBe(false);
    expect(looksLikeCompanyName("Cese de administrador")).toBe(false);
    expect(looksLikeCompanyName("Dimisión de consejero")).toBe(false);
    expect(looksLikeCompanyName("Nombramientos")).toBe(false);
    expect(looksLikeCompanyName("Nombramiento administrador único")).toBe(false);
    expect(looksLikeCompanyName("Revocación apoderados")).toBe(false);
    expect(looksLikeCompanyName("Modificación estatutos")).toBe(false);
    expect(looksLikeCompanyName("Adquisición participaciones")).toBe(false);
    expect(looksLikeCompanyName("Disolución y liquidación")).toBe(false);
    expect(looksLikeCompanyName("Liquidación")).toBe(false);
    expect(looksLikeCompanyName("Apoderados")).toBe(false);
    expect(looksLikeCompanyName("Administradores")).toBe(false);
    expect(looksLikeCompanyName("Capital social")).toBe(false);
    expect(looksLikeCompanyName("Cambio de denominación")).toBe(false);
    expect(looksLikeCompanyName("Datos registrales")).toBe(false);
    expect(looksLikeCompanyName("Junta general")).toBe(false);
    expect(looksLikeCompanyName("Ampliación capital")).toBe(false);
    expect(looksLikeCompanyName("Reducción capital")).toBe(false);
  });

  it("rechaza palabras genéricas con artículo", () => {
    expect(looksLikeCompanyName("La empresa")).toBe(false);
    expect(looksLikeCompanyName("El socio único")).toBe(false);
    expect(looksLikeCompanyName("Se nombran administradores")).toBe(false);
    expect(looksLikeCompanyName("Socio único")).toBe(false);
  });

  it("acepta nombres de empresa reales", () => {
    expect(looksLikeCompanyName("GRUPO FIRE BUSINESS SL")).toBe(true);
    expect(looksLikeCompanyName("EUROFESA SA")).toBe(true);
    expect(looksLikeCompanyName("PLANA FABREGA SEGURETAT SL")).toBe(true);
    expect(looksLikeCompanyName("BLANCO PAÑOS JOSE LUIS")).toBe(true);
    expect(looksLikeCompanyName("LUCIANO VILLEN MARTA")).toBe(true);
  });
});

describe("extractAdquirente", () => {
  it("devuelve null si descripcion es null o vacía", () => {
    expect(extractAdquirente(null)).toBeNull();
    expect(extractAdquirente("")).toBeNull();
  });

  it("extrae el socio único cuando es una empresa real", () => {
    expect(
      extractAdquirente("Socio único: GRUPO FIRE BUSINESS SL. Otros datos.")
    ).toBe("GRUPO FIRE BUSINESS SL");
    expect(
      extractAdquirente("Socio Unico. EUROFESA SA")
    ).toBe("EUROFESA SA");
  });

  it("NO confunde 'Ceses/Dimisiones' como adquirente tras 'Unipersonalidad.'", () => {
    // Caso real reportado por el usuario: ALMANA INGENIERIA E INSTALACIONES
    // mostraba "Ceses/Dimisiones" como adquirente en la columna Adquirente.
    const texto =
      "Adquisición de participaciones. Unipersonalidad. Ceses/Dimisiones: Juan Pérez García. Otros datos.";
    expect(extractAdquirente(texto)).toBeNull();
  });

  it("NO confunde 'Nombramientos' como adquirente tras 'Socio único:'", () => {
    const texto =
      "Cambios societarios. Socio único: Nombramientos administradores. Resto del acto.";
    expect(extractAdquirente(texto)).toBeNull();
  });

  it("NO confunde 'Disolución y liquidación' como adquirente tras 'Sociedad absorbente:'", () => {
    const texto =
      "Operación societaria. Sociedad absorbente: Disolución y liquidación. Notas.";
    expect(extractAdquirente(texto)).toBeNull();
  });

  it("extrae correctamente cuando hay 'Unipersonalidad.' seguida de empresa real", () => {
    const texto =
      "Adquisición de participaciones. Unipersonalidad. ATTLON TECHNOLOGIES SL. Notas finales.";
    expect(extractAdquirente(texto)).toBe("ATTLON TECHNOLOGIES SL");
  });

  it("extrae correctamente la sociedad absorbente en fusiones", () => {
    const texto =
      "Fusión por absorción. Sociedad absorbente: GRUPO FIRE BUSINESS SL. Sociedades absorbidas: XYZ.";
    expect(extractAdquirente(texto)).toBe("GRUPO FIRE BUSINESS SL");
  });

  it("prefiere socio único sobre unipersonalidad si ambos aparecen", () => {
    const texto =
      "Socio único: ATTLON HOLDING SL. Unipersonalidad. Ceses/Dimisiones.";
    expect(extractAdquirente(texto)).toBe("ATTLON HOLDING SL");
  });

  it("devuelve null cuando no hay patrón identificable", () => {
    expect(
      extractAdquirente("Depósito de cuentas anuales del ejercicio 2024.")
    ).toBeNull();
    expect(extractAdquirente("Cambio de domicilio social.")).toBeNull();
  });
});
