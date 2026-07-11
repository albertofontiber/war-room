/**
 * Tests del flujo `authorize` del provider `finder-credentials`. Cubre:
 *   - login_success cuando email + bcrypt OK
 *   - login_failure cuando el email NO existe (finderId=null en el log)
 *   - login_failure cuando el finder está inactivo
 *   - login_failure cuando el finder no tiene passwordHash
 *   - login_failure cuando bcrypt falla
 *   - extracción de ip / userAgent desde headers (incluyendo x-forwarded-for
 *     con varios hops y cuando viene como array)
 *
 * Y del provider `admin-credentials` (hardening 2026-07):
 *   - adminPasswordMatches: hash bcrypt (preferido), texto plano legacy en
 *     tiempo constante, credencial vacía nunca matchea
 *   - authorize: success con hash, failure con password errónea (y log.warn)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const finderFindUnique = vi.fn();
const bcryptCompare = vi.fn();
const logFinderActionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finder: { findUnique: (...a: unknown[]) => finderFindUnique(...a) },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: (...a: unknown[]) => bcryptCompare(...a) },
}));

vi.mock("@/lib/finder-access-log", () => ({
  logFinderAction: (...a: unknown[]) => logFinderActionMock(...a),
}));

const logWarnMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: (...a: unknown[]) => logWarnMock(...a),
    error: vi.fn(),
  },
}));

import { adminPasswordMatches, authOptions } from "./auth";

type AuthorizeFn = (
  credentials: Record<string, string> | undefined,
  req: { headers?: Record<string, string | string[] | undefined> } | undefined
) => Promise<unknown>;

/**
 * NextAuth v4 wrappea CredentialsProvider: el `id` y `authorize` originales
 * que se pasaron al factory quedan dentro de `.options`. Identificamos el
 * provider de finder por `options.id` y devolvemos `options.authorize`.
 */
function getFinderAuthorize(): AuthorizeFn {
  const providers = authOptions.providers as unknown as Array<{
    options?: { id?: string; authorize?: AuthorizeFn };
  }>;
  const found = providers.find((p) => p.options?.id === "finder-credentials");
  if (!found?.options?.authorize) {
    throw new Error("finder-credentials authorize not found");
  }
  return found.options.authorize;
}

const REQ = {
  headers: {
    "x-forwarded-for": "203.0.113.5, 10.0.0.1",
    "user-agent": "Mozilla/5.0 test",
  },
};

beforeEach(() => {
  finderFindUnique.mockReset();
  bcryptCompare.mockReset();
  logFinderActionMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("finder-credentials authorize", () => {
  it("login_success cuando email + bcrypt OK; sesión incluye finderId", async () => {
    finderFindUnique.mockResolvedValueOnce({
      id: "f1",
      name: "Rafa",
      email: "rafa@externo.com",
      active: true,
      passwordHash: "$2a$10$hash",
      sessionVersion: 3,
    });
    bcryptCompare.mockResolvedValueOnce(true);

    const authorize = getFinderAuthorize();
    const result = await authorize(
      { email: "  Rafa@Externo.com  ", password: "pw" },
      REQ
    );

    // sessionVersion viaja al JWT para poder invalidar la sesión luego.
    expect(result).toMatchObject({
      id: "f1",
      kind: "finder",
      finderId: "f1",
      sessionVersion: 3,
    });
    expect(logFinderActionMock).toHaveBeenCalledTimes(1);
    expect(logFinderActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finderId: "f1",
        email: "rafa@externo.com", // normalizado lowercase + trim
        action: "login_success",
        ip: "203.0.113.5", // primer valor de x-forwarded-for
        userAgent: "Mozilla/5.0 test",
      })
    );
  });

  it("login_failure con finderId=null si el email no existe en Finder", async () => {
    finderFindUnique.mockResolvedValueOnce(null);
    const authorize = getFinderAuthorize();
    const result = await authorize(
      { email: "unknown@x.com", password: "pw" },
      REQ
    );
    expect(result).toBeNull();
    expect(logFinderActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finderId: null,
        email: "unknown@x.com",
        action: "login_failure",
      })
    );
    expect(bcryptCompare).not.toHaveBeenCalled();
  });

  it("login_failure cuando el finder existe pero está inactivo", async () => {
    finderFindUnique.mockResolvedValueOnce({
      id: "f9",
      name: "Inactivo",
      email: "off@x.com",
      active: false,
      passwordHash: "$2a$10$hash",
    });
    const authorize = getFinderAuthorize();
    const result = await authorize(
      { email: "off@x.com", password: "pw" },
      REQ
    );
    expect(result).toBeNull();
    expect(logFinderActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finderId: "f9", // se sabe quién intentó, aunque esté inactivo
        action: "login_failure",
      })
    );
    expect(bcryptCompare).not.toHaveBeenCalled();
  });

  it("login_failure cuando el finder no tiene passwordHash (acceso aún no provisto)", async () => {
    finderFindUnique.mockResolvedValueOnce({
      id: "f2",
      name: "Sin pass",
      email: "nopw@x.com",
      active: true,
      passwordHash: null,
    });
    const authorize = getFinderAuthorize();
    const result = await authorize(
      { email: "nopw@x.com", password: "pw" },
      REQ
    );
    expect(result).toBeNull();
    expect(logFinderActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finderId: "f2",
        action: "login_failure",
      })
    );
    expect(bcryptCompare).not.toHaveBeenCalled();
  });

  it("login_failure cuando bcrypt rechaza la contraseña", async () => {
    finderFindUnique.mockResolvedValueOnce({
      id: "f3",
      name: "Rafa",
      email: "rafa@x.com",
      active: true,
      passwordHash: "$2a$10$hash",
    });
    bcryptCompare.mockResolvedValueOnce(false);
    const authorize = getFinderAuthorize();
    const result = await authorize(
      { email: "rafa@x.com", password: "wrong" },
      REQ
    );
    expect(result).toBeNull();
    expect(logFinderActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        finderId: "f3",
        action: "login_failure",
      })
    );
  });

  it("no loguea nada si faltan credenciales (no es un intento real)", async () => {
    const authorize = getFinderAuthorize();
    const result = await authorize({} as never, REQ);
    expect(result).toBeNull();
    expect(logFinderActionMock).not.toHaveBeenCalled();
    expect(finderFindUnique).not.toHaveBeenCalled();
  });

  it("acepta x-forwarded-for como array (varios proxies)", async () => {
    finderFindUnique.mockResolvedValueOnce(null);
    const authorize = getFinderAuthorize();
    await authorize(
      { email: "x@y.com", password: "pw" },
      { headers: { "x-forwarded-for": ["1.2.3.4", "5.6.7.8"] } }
    );
    expect(logFinderActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "1.2.3.4" })
    );
  });

  it("cae a x-real-ip si no hay x-forwarded-for", async () => {
    finderFindUnique.mockResolvedValueOnce(null);
    const authorize = getFinderAuthorize();
    await authorize(
      { email: "x@y.com", password: "pw" },
      { headers: { "x-real-ip": "9.9.9.9" } }
    );
    expect(logFinderActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "9.9.9.9" })
    );
  });

  it("ip=null si no hay ningún header de IP", async () => {
    finderFindUnique.mockResolvedValueOnce(null);
    const authorize = getFinderAuthorize();
    await authorize(
      { email: "x@y.com", password: "pw" },
      { headers: {} }
    );
    expect(logFinderActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ ip: null, userAgent: null })
    );
  });
});

// ─── Provider admin-credentials (hardening) ─────────────────────────────────

function getAdminAuthorize(): AuthorizeFn {
  const providers = authOptions.providers as unknown as Array<{
    options?: { id?: string; authorize?: AuthorizeFn };
  }>;
  const found = providers.find((p) => p.options?.id === "admin-credentials");
  if (!found?.options?.authorize) {
    throw new Error("admin-credentials authorize not found");
  }
  return found.options.authorize;
}

describe("adminPasswordMatches", () => {
  beforeEach(() => {
    bcryptCompare.mockReset();
  });

  it("texto plano legacy: match exacto en tiempo constante", async () => {
    expect(await adminPasswordMatches("secreto", { password: "secreto" })).toBe(true);
    expect(await adminPasswordMatches("secretO", { password: "secreto" })).toBe(false);
    expect(await adminPasswordMatches("secret", { password: "secreto" })).toBe(false);
  });

  it("credencial vacía nunca matchea (default '' de las envs)", async () => {
    expect(await adminPasswordMatches("", { password: "" })).toBe(false);
    expect(await adminPasswordMatches("", {})).toBe(false);
    expect(await adminPasswordMatches("lo-que-sea", { password: undefined })).toBe(false);
  });

  it("si hay hash, gana el hash (bcrypt.compare) e ignora el texto plano", async () => {
    bcryptCompare.mockResolvedValueOnce(true);
    expect(
      await adminPasswordMatches("pw", { password: "otra", passwordHash: "$2a$10$hash" })
    ).toBe(true);
    expect(bcryptCompare).toHaveBeenCalledWith("pw", "$2a$10$hash");

    bcryptCompare.mockResolvedValueOnce(false);
    expect(
      await adminPasswordMatches("pw-mala", { password: "pw-mala", passwordHash: "$2a$10$hash" })
    ).toBe(false);
  });
});

describe("authorize (admin-credentials)", () => {
  beforeEach(() => {
    bcryptCompare.mockReset();
    logWarnMock.mockReset();
    vi.stubEnv("ADMIN_USER_1", "alberto");
    vi.stubEnv("ADMIN_PASS_HASH_1", "$2a$10$hash-alberto");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("success con hash: devuelve kind admin y no loguea warn", async () => {
    bcryptCompare.mockResolvedValueOnce(true);
    const authorize = getAdminAuthorize();
    const user = (await authorize(
      { username: "alberto", password: "correcta" },
      REQ
    )) as { kind: string; name: string } | null;
    expect(user).toMatchObject({ kind: "admin", name: "alberto" });
    expect(logWarnMock).not.toHaveBeenCalled();
  });

  it("password errónea: null + log.warn con username e ip", async () => {
    bcryptCompare.mockResolvedValueOnce(false);
    const authorize = getAdminAuthorize();
    const user = await authorize({ username: "alberto", password: "mala" }, REQ);
    expect(user).toBeNull();
    expect(logWarnMock).toHaveBeenCalledWith(
      "auth/admin",
      "login_failure",
      expect.objectContaining({ username: "alberto", ip: "203.0.113.5" })
    );
  });

  it("username desconocido: null + log.warn (sin filtrar si existe o no)", async () => {
    const authorize = getAdminAuthorize();
    const user = await authorize({ username: "intruso", password: "x" }, REQ);
    expect(user).toBeNull();
    expect(bcryptCompare).not.toHaveBeenCalled();
    expect(logWarnMock).toHaveBeenCalled();
  });
});
