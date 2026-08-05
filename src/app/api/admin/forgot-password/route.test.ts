import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const userFindUnique = vi.fn();
const tokenUpdateMany = vi.fn();
const tokenCreate = vi.fn();
const sendEmail = vi.fn();
const isConfiguredEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    adminPasswordResetToken: {
      updateMany: (...args: unknown[]) => tokenUpdateMany(...args),
      create: (...args: unknown[]) => tokenCreate(...args),
    },
  },
}));

vi.mock("@/lib/email-password-reset", () => ({
  sendAdminPasswordResetEmail: (...args: unknown[]) => sendEmail(...args),
}));

vi.mock("@/lib/admin-credentials", () => ({
  isConfiguredAdminEmail: (...args: unknown[]) => isConfiguredEmail(...args),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/admin/forgot-password", () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    tokenUpdateMany.mockReset();
    tokenCreate.mockReset();
    sendEmail.mockReset();
    isConfiguredEmail.mockReset();
    isConfiguredEmail.mockReturnValue(true);
    tokenUpdateMany.mockResolvedValue({ count: 0 });
    tokenCreate.mockResolvedValue({ id: "token-1" });
    sendEmail.mockResolvedValue(undefined);
  });

  it("rechaza un email malformado", async () => {
    const response = await POST(makeReq({ email: "no-es-email" }));
    expect(response.status).toBe(400);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("no revela ni consulta emails que no pertenecen al login admin", async () => {
    isConfiguredEmail.mockReturnValue(false);
    const response = await POST(makeReq({ email: "otro@fontiber.com" }));
    expect(response.status).toBe(200);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("responde igual para una cuenta inexistente o inactiva", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    expect((await POST(makeReq({ email: "gabriel@fontiber.com" }))).status).toBe(200);

    userFindUnique.mockResolvedValueOnce({
      id: "u2",
      name: "Gabriel",
      email: "gabriel@fontiber.com",
      role: "admin",
      active: false,
    });
    expect((await POST(makeReq({ email: "gabriel@fontiber.com" }))).status).toBe(200);
    expect(tokenCreate).not.toHaveBeenCalled();
  });

  it("invalida el token anterior, guarda sha256 y envía solo el token raw", async () => {
    userFindUnique.mockResolvedValue({
      id: "u2",
      name: "Gabriel",
      email: "gabriel@fontiber.com",
      role: "admin",
      active: true,
    });

    const response = await POST(
      makeReq({ email: "  GABRIEL@FONTIBER.COM " })
    );
    expect(response.status).toBe(200);
    expect(tokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u2", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    const createData = tokenCreate.mock.calls[0][0].data;
    const emailData = sendEmail.mock.calls[0][0];
    expect(emailData).toMatchObject({
      to: "gabriel@fontiber.com",
      adminName: "Gabriel",
    });
    expect(emailData.rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(createData.tokenHash).toBe(
      crypto.createHash("sha256").update(emailData.rawToken).digest("hex")
    );
    expect(createData.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("espera a que el proveedor de email termine antes de responder", async () => {
    userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Alberto",
      email: "alberto@fontiber.com",
      role: "admin",
      active: true,
    });

    let finishSend!: () => void;
    sendEmail.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSend = resolve;
      })
    );

    const pendingResponse = POST(
      makeReq({ email: "alberto@fontiber.com" })
    );
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));

    let responseFinished = false;
    void pendingResponse.then(() => {
      responseFinished = true;
    });
    await Promise.resolve();
    expect(responseFinished).toBe(false);

    finishSend();
    expect((await pendingResponse).status).toBe(200);
    expect(responseFinished).toBe(true);
  });
});
