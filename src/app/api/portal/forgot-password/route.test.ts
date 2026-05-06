/**
 * Tests para POST /api/portal/forgot-password — entrada del flow self-service
 * de reset de password. Cubre: anti-enumeración (siempre 200), invalidación de
 * tokens previos, generación de nuevo token con sha256 hash, envío de email
 * fire-and-forget.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const finderFindUnique = vi.fn();
const tokenUpdateMany = vi.fn();
const tokenCreate = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finder: { findUnique: (...a: unknown[]) => finderFindUnique(...a) },
    passwordResetToken: {
      updateMany: (...a: unknown[]) => tokenUpdateMany(...a),
      create: (...a: unknown[]) => tokenCreate(...a),
    },
  },
}));

vi.mock("@/lib/email-password-reset", () => ({
  sendPasswordResetEmail: (...a: unknown[]) => sendEmail(...a),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/portal/forgot-password", () => {
  beforeEach(() => {
    finderFindUnique.mockReset();
    tokenUpdateMany.mockReset();
    tokenCreate.mockReset();
    sendEmail.mockReset();
    tokenUpdateMany.mockResolvedValue({ count: 0 });
    tokenCreate.mockResolvedValue({ id: "tok-1" });
    sendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("400 si el body es inválido (email malformado)", async () => {
    const res = await POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(finderFindUnique).not.toHaveBeenCalled();
  });

  it("anti-enumeración: 200 aunque el email no exista (sin tocar token tables)", async () => {
    finderFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    expect(tokenUpdateMany).not.toHaveBeenCalled();
    expect(tokenCreate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("anti-enumeración: 200 si el finder existe pero está inactivo (no manda email)", async () => {
    finderFindUnique.mockResolvedValue({
      id: "f1",
      name: "Pepe",
      email: "p@x.com",
      active: false,
    });
    const res = await POST(makeReq({ email: "p@x.com" }));
    expect(res.status).toBe(200);
    expect(tokenCreate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("happy path: invalida tokens previos, crea nuevo y manda email", async () => {
    finderFindUnique.mockResolvedValue({
      id: "f1",
      name: "Pepe",
      email: "p@x.com",
      active: true,
    });
    const res = await POST(makeReq({ email: "p@x.com" }));
    expect(res.status).toBe(200);

    // Email se busca normalizado (lowercase + trim) por el zod schema.
    expect(finderFindUnique).toHaveBeenCalledWith({
      where: { email: "p@x.com" },
      select: { id: true, name: true, email: true, active: true },
    });

    // 1) Invalidación de tokens previos no usados.
    expect(tokenUpdateMany).toHaveBeenCalledWith({
      where: { finderId: "f1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    // 2) Token nuevo creado con sha256 hex (64 chars) y expiresAt futuro.
    expect(tokenCreate).toHaveBeenCalledTimes(1);
    const createArgs = tokenCreate.mock.calls[0][0];
    expect(createArgs.data.finderId).toBe("f1");
    expect(createArgs.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(createArgs.data.expiresAt).toBeInstanceOf(Date);
    expect(createArgs.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // ~24h de caducidad (con un pelín de margen por el tiempo de ejecución).
    const horasRestantes =
      (createArgs.data.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000);
    expect(horasRestantes).toBeGreaterThan(23);
    expect(horasRestantes).toBeLessThanOrEqual(24);

    // 3) Email mandado con raw token (no el hash).
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe("p@x.com");
    expect(emailArgs.finderName).toBe("Pepe");
    expect(emailArgs.rawToken).toMatch(/^[0-9a-f]{64}$/);
    // El hash en BD debe coincidir con sha256 del raw del email.
    const expectedHash = crypto
      .createHash("sha256")
      .update(emailArgs.rawToken)
      .digest("hex");
    expect(createArgs.data.tokenHash).toBe(expectedHash);
  });

  it("normaliza el email (trim + lowercase) antes de buscar", async () => {
    finderFindUnique.mockResolvedValue(null);
    await POST(makeReq({ email: "  P@X.com  " }));
    expect(finderFindUnique).toHaveBeenCalledWith({
      where: { email: "p@x.com" },
      select: expect.any(Object),
    });
  });

  it("dos peticiones consecutivas generan tokens diferentes", async () => {
    finderFindUnique.mockResolvedValue({
      id: "f1",
      name: "Pepe",
      email: "p@x.com",
      active: true,
    });
    await POST(makeReq({ email: "p@x.com" }));
    await POST(makeReq({ email: "p@x.com" }));
    const t1 = sendEmail.mock.calls[0][0].rawToken;
    const t2 = sendEmail.mock.calls[1][0].rawToken;
    expect(t1).not.toBe(t2);
    // Y la segunda llamada invalida tokens previos otra vez.
    expect(tokenUpdateMany).toHaveBeenCalledTimes(2);
  });
});
