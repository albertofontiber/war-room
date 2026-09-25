import { describe, expect, it } from "vitest";
import { destinoTrasLogin, urlLogin, type Zona } from "./login-destino";

/** Lo que haría el login al abrir `href`: leer `callbackUrl` y decidir adónde ir. */
function trasEntrar(zona: Zona, href: string) {
  const callbackUrl = new URL(href, "https://warroom.fontiber.com").searchParams.get("callbackUrl");
  return destinoTrasLogin(zona, callbackUrl);
}

describe("urlLogin + destinoTrasLogin: vuelve a la página pedida", () => {
  it.each<[Zona, string]>([
    ["warroom", "/?vista=operaciones"],
    ["warroom", "/?empresa=123"],
    ["warroom", "/pipeline?empresa=12&owner=alberto%40fontiber.com"],
    ["warroom", "/finders/proposals"],
    ["portal", "/portal/empresas/42"],
    ["portal", "/portal/proponer"],
  ])("%s %s", (zona, destino) => {
    expect(trasEntrar(zona, urlLogin(zona, destino))).toBe(destino);
  });

  it("codifica el destino en `callbackUrl`", () => {
    expect(urlLogin("warroom", "/?vista=operaciones")).toBe(
      "/login?callbackUrl=%2F%3Fvista%3Doperaciones",
    );
    expect(urlLogin("portal", "/portal/empresas/42")).toBe(
      "/portal/login?callbackUrl=%2Fportal%2Fempresas%2F42",
    );
  });

  it("la portada de cada zona no se pide: login a secas", () => {
    expect(urlLogin("warroom", "/")).toBe("/login");
    expect(urlLogin("portal", "/portal")).toBe("/portal/login");
    // En portal.fontiber.com la raíz se reescribe a /portal.
    expect(urlLogin("portal", "/")).toBe("/portal/login");
  });

  it("una API no es destino: login a secas", () => {
    expect(urlLogin("warroom", "/api/empresas")).toBe("/login");
    expect(urlLogin("portal", "/api/portal/pipeline")).toBe("/portal/login");
  });
});

describe("destinoTrasLogin: nunca sale de la zona", () => {
  it("sin destino, la portada de la zona", () => {
    expect(destinoTrasLogin("warroom", null)).toBe("/");
    expect(destinoTrasLogin("warroom", undefined)).toBe("/");
    expect(destinoTrasLogin("warroom", "")).toBe("/");
    expect(destinoTrasLogin("portal", null)).toBe("/portal");
  });

  it.each([
    "https://evil.com",
    "http://evil.com/pipeline",
    "//evil.com",
    "//evil.com/pipeline",
    "/\\evil.com",
    "/\t/evil.com",
    "/.//evil.com",
    "javascript:alert(1)",
    "evil.com",
    " /pipeline",
  ])("rechaza %j (otro dominio o no es una ruta)", (callbackUrl) => {
    expect(destinoTrasLogin("warroom", callbackUrl)).toBe("/");
    expect(destinoTrasLogin("portal", callbackUrl)).toBe("/portal");
  });

  it("un admin no vuelve al portal ni un finder al War Room", () => {
    expect(destinoTrasLogin("warroom", "/portal/empresas/42")).toBe("/");
    expect(destinoTrasLogin("portal", "/pipeline")).toBe("/portal");
    expect(destinoTrasLogin("portal", "/?vista=operaciones")).toBe("/portal");
  });

  it("no vuelve al propio login (bucle)", () => {
    expect(destinoTrasLogin("warroom", "/login?callbackUrl=%2Fpipeline")).toBe("/");
    expect(destinoTrasLogin("portal", "/portal/login")).toBe("/portal");
  });

  it("normaliza la ruta y descarta el fragmento", () => {
    expect(destinoTrasLogin("warroom", "/finders/../pipeline?empresa=1#nota")).toBe(
      "/pipeline?empresa=1",
    );
  });
});
