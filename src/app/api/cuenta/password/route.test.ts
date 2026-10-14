import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestingAdmin = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const bcryptHash = vi.fn();
const passwordMatches = vi.fn();
const revokeLinks = vi.fn();

vi.mock("@/lib/admin-users", () => ({
  getRequestingAdmin: () => getRequestingAdmin(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash: (...a: unknown[]) => bcryptHash(...a) } }));
vi.mock("@/lib/auth", () => ({
  adminPasswordMatches: (...a: unknown[]) => passwordMatches(...a),
}));
vi.mock("@/lib/admin-credentials", () => ({
  findAdminCredentialByEmail: () => undefined,
}));
vi.mock("@/lib/admin-password-link", () => ({
  revokeAdminPasswordLinks: (...a: unknown[]) => revokeLinks(...a),
}));
vi.mock("@/lib/audit-log", () => ({ auditLog: vi.fn() }));

import { POST } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  for (const m of [getRequestingAdmin, userFindUnique, userUpdate, bcryptHash, passwordMatches, revokeLinks]) {
    m.mockReset();
  }
  getRequestingAdmin.mockResolvedValue({ id: "u1", name: "Lucía", email: "lucia@fontiber.com" });
  userFindUnique.mockResolvedValue({ id: "u1", email: "lucia@fontiber.com", passwordHash: "$2a$10$vieja" });
  bcryptHash.mockResolvedValue("$2a$10$nueva");
});

describe("POST /api/cuenta/password", () => {
  it("401 sin sesión", async () => {
    getRequestingAdmin.mockResolvedValue(null);
    const res = await POST(makeReq({ currentPassword: "a", newPassword: "nueva-contraseña" }));
    expect(res.status).toBe(401);
  });

  it("rechaza si la contraseña actual no es correcta y no guarda nada", async () => {
    passwordMatches.mockResolvedValue(false);
    const res = await POST(makeReq({ currentPassword: "mala", newPassword: "nueva-contraseña" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/actual no es correcta/);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña nueva corta antes de comprobar nada", async () => {
    const res = await POST(makeReq({ currentPassword: "buena", newPassword: "corta" }));
    expect(res.status).toBe(400);
    expect(passwordMatches).not.toHaveBeenCalled();
  });

  it("guarda el hash nuevo y anula los enlaces pendientes", async () => {
    passwordMatches.mockResolvedValue(true);
    const res = await POST(makeReq({ currentPassword: "buena-actual", newPassword: "nueva-contraseña" }));
    expect(res.status).toBe(200);
    expect(passwordMatches).toHaveBeenCalledWith("buena-actual", {
      password: undefined,
      passwordHash: "$2a$10$vieja",
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "$2a$10$nueva", passwordSetAt: expect.any(Date) },
    });
    expect(revokeLinks).toHaveBeenCalledWith("u1");
  });
});
