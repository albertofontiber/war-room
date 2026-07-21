import { beforeEach, describe, expect, it, vi } from "vitest";

const tokenFindUnique = vi.fn();
const tokenUpdate = vi.fn();
const userUpdate = vi.fn();
const transaction = vi.fn();
const bcryptHash = vi.fn();
const auditLog = vi.fn();
const isConfiguredEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminPasswordResetToken: {
      findUnique: (...args: unknown[]) => tokenFindUnique(...args),
      update: (...args: unknown[]) => tokenUpdate(...args),
    },
    user: { update: (...args: unknown[]) => userUpdate(...args) },
    $transaction: (operations: unknown[]) => transaction(operations),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: (...args: unknown[]) => bcryptHash(...args) },
}));

vi.mock("@/lib/audit-log", () => ({
  auditLog: (...args: unknown[]) => auditLog(...args),
}));

vi.mock("@/lib/admin-credentials", () => ({
  isConfiguredAdminEmail: (...args: unknown[]) => isConfiguredEmail(...args),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const RAW_TOKEN = "abcdef0123456789".repeat(4);

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "token-1",
    userId: "u2",
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    user: {
      id: "u2",
      email: "gabriel@fontiber.com",
      role: "admin",
      active: true,
    },
    ...overrides,
  };
}

describe("POST /api/admin/reset-password", () => {
  beforeEach(() => {
    tokenFindUnique.mockReset();
    tokenUpdate.mockReset();
    userUpdate.mockReset();
    transaction.mockReset();
    bcryptHash.mockReset();
    auditLog.mockReset();
    isConfiguredEmail.mockReset();
    bcryptHash.mockResolvedValue("$2a$10$hash-nuevo");
    transaction.mockResolvedValue([{}, {}]);
    auditLog.mockResolvedValue(undefined);
    isConfiguredEmail.mockReturnValue(true);
  });

  it("rechaza contraseña corta antes de consultar el token", async () => {
    const response = await POST(makeReq({ token: RAW_TOKEN, password: "corta" }));
    expect(response.status).toBe(400);
    expect(tokenFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["inexistente", null],
    ["usado", validRecord({ usedAt: new Date() })],
    ["caducado", validRecord({ expiresAt: new Date(Date.now() - 1_000) })],
  ])("rechaza un token %s con el mismo error", async (_label, record) => {
    tokenFindUnique.mockResolvedValue(record);
    const response = await POST(
      makeReq({ token: RAW_TOKEN, password: "contraseña-nueva" })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Token inválido o caducado" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rechaza una cuenta desactivada o que ya no esté configurada", async () => {
    tokenFindUnique.mockResolvedValueOnce(
      validRecord({
        user: {
          id: "u2",
          email: "gabriel@fontiber.com",
          role: "admin",
          active: false,
        },
      })
    );
    expect(
      (
        await POST(makeReq({ token: RAW_TOKEN, password: "contraseña-nueva" }))
      ).status
    ).toBe(400);

    tokenFindUnique.mockResolvedValueOnce(validRecord());
    isConfiguredEmail.mockReturnValue(false);
    expect(
      (
        await POST(makeReq({ token: RAW_TOKEN, password: "contraseña-nueva" }))
      ).status
    ).toBe(400);
  });

  it("guarda bcrypt, consume el token y audita el cambio", async () => {
    tokenFindUnique.mockResolvedValue(validRecord());
    const response = await POST(
      makeReq({ token: RAW_TOKEN, password: "contraseña-nueva" })
    );
    expect(response.status).toBe(200);
    expect(bcryptHash).toHaveBeenCalledWith("contraseña-nueva", 10);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: {
        passwordHash: "$2a$10$hash-nuevo",
        passwordSetAt: expect.any(Date),
      },
    });
    expect(tokenUpdate).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { usedAt: expect.any(Date) },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "admin",
        actorId: "u2",
        entityType: "user",
        metadata: { event: "password_reset_self" },
      })
    );
  });
});
