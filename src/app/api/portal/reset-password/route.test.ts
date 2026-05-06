/**
 * Tests para POST /api/portal/reset-password — consume un token de reset y
 * actualiza la password del finder. Cubre: validación, casos de token (no
 * existe, ya usado, caducado, finder inactivo) todos como 400 genérico,
 * happy path con bcrypt + transaction + auditLog.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const tokenFindUnique = vi.fn();
const finderUpdate = vi.fn();
const tokenUpdate = vi.fn();
const txMock = vi.fn();
const auditLogMock = vi.fn();
const bcryptHash = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    passwordResetToken: {
      findUnique: (...a: unknown[]) => tokenFindUnique(...a),
      update: (...a: unknown[]) => tokenUpdate(...a),
    },
    finder: {
      update: (...a: unknown[]) => finderUpdate(...a),
    },
    $transaction: (ops: unknown[]) => txMock(ops),
  },
}));

vi.mock("@/lib/audit-log", () => ({
  auditLog: (...a: unknown[]) => auditLogMock(...a),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: (...a: unknown[]) => bcryptHash(...a),
  },
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

const RAW_TOKEN = "abcdef0123456789".repeat(4); // 64 hex chars
const TOKEN_HASH = crypto.createHash("sha256").update(RAW_TOKEN).digest("hex");

describe("POST /api/portal/reset-password", () => {
  beforeEach(() => {
    tokenFindUnique.mockReset();
    finderUpdate.mockReset();
    tokenUpdate.mockReset();
    txMock.mockReset();
    auditLogMock.mockReset();
    bcryptHash.mockReset();
    bcryptHash.mockResolvedValue("$2a$10$mock_bcrypt_hash");
    txMock.mockResolvedValue([{}, {}]);
    auditLogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("400 si el body es inválido (sin token)", async () => {
    const res = await POST(makeReq({ password: "long-enough-pwd" }));
    expect(res.status).toBe(400);
    expect(tokenFindUnique).not.toHaveBeenCalled();
  });

  it("400 si la password es < 10 chars", async () => {
    const res = await POST(makeReq({ token: RAW_TOKEN, password: "corta" }));
    expect(res.status).toBe(400);
    expect(tokenFindUnique).not.toHaveBeenCalled();
  });

  it("400 si el token no existe", async () => {
    tokenFindUnique.mockResolvedValue(null);
    const res = await POST(
      makeReq({ token: RAW_TOKEN, password: "long-enough-pwd" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Token inválido");
    expect(txMock).not.toHaveBeenCalled();
  });

  it("400 si el token ya fue usado (no leak: misma respuesta que 'no existe')", async () => {
    tokenFindUnique.mockResolvedValue({
      id: "tok-1",
      finderId: "f1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(Date.now() - 60_000),
      finder: { id: "f1", email: "p@x.com", active: true },
    });
    const res = await POST(
      makeReq({ token: RAW_TOKEN, password: "long-enough-pwd" })
    );
    expect(res.status).toBe(400);
    expect(txMock).not.toHaveBeenCalled();
  });

  it("400 si el token está caducado", async () => {
    tokenFindUnique.mockResolvedValue({
      id: "tok-1",
      finderId: "f1",
      expiresAt: new Date(Date.now() - 60_000),
      usedAt: null,
      finder: { id: "f1", email: "p@x.com", active: true },
    });
    const res = await POST(
      makeReq({ token: RAW_TOKEN, password: "long-enough-pwd" })
    );
    expect(res.status).toBe(400);
    expect(txMock).not.toHaveBeenCalled();
  });

  it("400 si el finder está inactivo (token sí válido, pero la cuenta no)", async () => {
    tokenFindUnique.mockResolvedValue({
      id: "tok-1",
      finderId: "f1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      finder: { id: "f1", email: "p@x.com", active: false },
    });
    const res = await POST(
      makeReq({ token: RAW_TOKEN, password: "long-enough-pwd" })
    );
    expect(res.status).toBe(400);
    expect(txMock).not.toHaveBeenCalled();
  });

  it("happy path: hashea pwd, actualiza finder + marca token usado en transacción y audita", async () => {
    tokenFindUnique.mockResolvedValue({
      id: "tok-1",
      finderId: "f1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      finder: { id: "f1", email: "p@x.com", active: true },
    });
    const res = await POST(
      makeReq({ token: RAW_TOKEN, password: "una-pwd-nueva" })
    );
    expect(res.status).toBe(200);

    // El token se busca por su hash sha256, no el raw.
    expect(tokenFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: TOKEN_HASH },
      select: expect.any(Object),
    });

    // bcrypt rounds=10 (igual que el endpoint admin de set-password).
    expect(bcryptHash).toHaveBeenCalledWith("una-pwd-nueva", 10);

    // Se invocó la transacción exactamente una vez con un array de 2
    // operaciones (update finder + update token).
    expect(txMock).toHaveBeenCalledTimes(1);
    expect(txMock.mock.calls[0][0]).toHaveLength(2);

    // Audit log con event=password_reset_self y actorType=finder.
    await new Promise((r) => setImmediate(r));
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "finder",
        actorId: "f1",
        action: "update",
        entityType: "finder",
        entityId: "f1",
        metadata: { event: "password_reset_self" },
      })
    );
  });
});
