/**
 * Tests de `graphFetch` retry on 401 + decodeJwtPayload.
 *
 * No mockeamos el fetch del token (lo dejamos fallar si AZURE_* no están
 * configurados, lo cual es esperado en CI). El env override + un mock
 * de `getAccessToken` cubren los casos que importan.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeJwtPayload } from "./graph-auth";

describe("decodeJwtPayload", () => {
  it("decodifica un JWT válido", () => {
    // JWT manualmente construido: header.{"sub":"x","roles":["Mail.Read"]}.sig
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "x", roles: ["Mail.Read", "Files.Read.All"], exp: 1234567890 })
    ).toString("base64url");
    const sig = "fake-signature";
    const token = `${header}.${payload}.${sig}`;

    const decoded = decodeJwtPayload(token);
    expect(decoded).toEqual({
      sub: "x",
      roles: ["Mail.Read", "Files.Read.All"],
      exp: 1234567890,
    });
  });

  it("retorna null si el token no tiene 3 partes", () => {
    expect(decodeJwtPayload("not.a.valid.token.at.all")).toBeNull();
    expect(decodeJwtPayload("only-one-part")).toBeNull();
    expect(decodeJwtPayload("two.parts")).toBeNull();
  });

  it("retorna null si el payload no es JSON válido", () => {
    const token = `header.${Buffer.from("not json").toString("base64url")}.sig`;
    expect(decodeJwtPayload(token)).toBeNull();
  });
});

describe("graphFetch retry on 401", () => {
  // Setup: env vars dummy para que getAccessToken pueda llamar a fetch
  // (mockeamos global.fetch para controlar todo el flow).
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.AZURE_TENANT_ID = "test-tenant";
    process.env.AZURE_CLIENT_ID = "test-client";
    process.env.AZURE_CLIENT_SECRET = "test-secret";
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    const mod = await import("./graph-auth");
    mod._resetGraphAuthCache();
    vi.restoreAllMocks();
  });

  it("invalida cache y reintenta cuando Graph devuelve 401", async () => {
    let tokenCallCount = 0;
    let graphCallCount = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("login.microsoftonline.com")) {
        tokenCallCount++;
        return new Response(
          JSON.stringify({
            access_token: `token-${tokenCallCount}`,
            expires_in: 3600,
          }),
          { status: 200 }
        );
      }

      if (url.includes("graph.microsoft.com")) {
        graphCallCount++;
        if (graphCallCount === 1) {
          // Primera llamada: 401 (token "expirado")
          return new Response(
            JSON.stringify({
              error: { code: "InvalidAuthenticationToken", message: "Lifetime validation failed" },
            }),
            { status: 401 }
          );
        }
        // Segunda llamada con token fresco: 200
        return new Response(JSON.stringify({ value: [{ id: "ok" }] }), { status: 200 });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof global.fetch;

    const { graphFetch } = await import("./graph-auth");
    const result = await graphFetch<{ value: Array<{ id: string }> }>("/test");

    expect(result.value[0].id).toBe("ok");
    expect(tokenCallCount).toBe(2); // token inicial + retry forceFresh
    expect(graphCallCount).toBe(2); // primera 401 + retry 200
  });

  it("propaga el error si el retry también falla con 401", async () => {
    let tokenCallCount = 0;
    let graphCallCount = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("login.microsoftonline.com")) {
        tokenCallCount++;
        return new Response(
          JSON.stringify({ access_token: `token-${tokenCallCount}`, expires_in: 3600 }),
          { status: 200 }
        );
      }

      graphCallCount++;
      return new Response(
        JSON.stringify({ error: { code: "Unauthorized", message: "Still failing" } }),
        { status: 401 }
      );
    }) as unknown as typeof global.fetch;

    const { graphFetch } = await import("./graph-auth");
    await expect(graphFetch("/test")).rejects.toThrow(/Graph .* failed \(401\)/);
    expect(graphCallCount).toBe(2); // primera + retry, ambas fallan
  });

  it("NO reintenta en errores no-401 (e.g. 403, 500)", async () => {
    let graphCallCount = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("login.microsoftonline.com")) {
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 }
        );
      }

      graphCallCount++;
      return new Response(
        JSON.stringify({ error: { code: "Forbidden" } }),
        { status: 403 }
      );
    }) as unknown as typeof global.fetch;

    const { graphFetch } = await import("./graph-auth");
    await expect(graphFetch("/test")).rejects.toThrow(/Graph .* failed \(403\)/);
    expect(graphCallCount).toBe(1); // sin retry
  });

  it("usa cache en llamadas sucesivas (no pide token nuevo cada vez)", async () => {
    let tokenCallCount = 0;
    let graphCallCount = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("login.microsoftonline.com")) {
        tokenCallCount++;
        return new Response(
          JSON.stringify({ access_token: "cached-token", expires_in: 3600 }),
          { status: 200 }
        );
      }

      graphCallCount++;
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }) as unknown as typeof global.fetch;

    const { graphFetch, _resetGraphAuthCache } = await import("./graph-auth");
    _resetGraphAuthCache();

    await graphFetch("/test1");
    await graphFetch("/test2");
    await graphFetch("/test3");

    expect(tokenCallCount).toBe(1); // solo una vez
    expect(graphCallCount).toBe(3);
  });
});
