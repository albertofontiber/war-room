import { describe, expect, it } from "vitest";
import { isTrustedMutation } from "./request-origin";

describe("protección de origen en mutaciones", () => {
  const request = (method: string, headers: Record<string, string> = {}) =>
    new Request("https://warroom.fontiber.com/api/cuenta", { method, headers });

  it("permite peticiones del mismo origen y lecturas", () => {
    expect(isTrustedMutation(request("POST", { origin: "https://warroom.fontiber.com" }))).toBe(true);
    expect(isTrustedMutation(request("GET", { origin: "https://other.example" }))).toBe(true);
  });
  it("rechaza orígenes cruzados, incluso subdominios hermanos, y valores nulos", () => {
    for (const origin of ["https://portal.fontiber.com", "https://evil.example", "null"]) {
      expect(isTrustedMutation(request("POST", { origin }))).toBe(false);
    }
    expect(isTrustedMutation(request("POST", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});
