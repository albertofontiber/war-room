import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
  send: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.findMany },
    notificacion: { createMany: mocks.createMany },
  },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { warn: mocks.warn, error: mocks.error, info: vi.fn() },
}));

import { notifyAdmins } from "./notifications";

const sinAvisos = { emailDiario: false, emailRegistros: false, emailCarpetas: false, emailPropuestas: false };
const ADMINS = [
  { id: "alberto", email: "alberto@x.com", ...sinAvisos, emailCarpetas: true, emailRegistros: true },
  { id: "gabriel", email: "gabriel@x.com", ...sinAvisos, emailCarpetas: true },
  { id: "otra", email: "otra@x.com", ...sinAvisos, emailDiario: true },
];

const base = { tipo: "docs_creados", titulo: "📁 Carpeta", mensaje: "Texto", link: "/pipeline" };

describe("notifyAdmins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    mocks.findMany.mockResolvedValue(ADMINS);
    mocks.createMany.mockResolvedValue({ count: ADMINS.length });
    mocks.send.mockResolvedValue({ error: null });
  });

  it("deja la campanita a todos y envía el correo solo a quien tiene el aviso activado", async () => {
    await notifyAdmins({ ...base, email: "emailCarpetas" });

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: ADMINS.map((a) => expect.objectContaining({ userId: a.id, tipo: "docs_creados" })),
    });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][0].to).toEqual(["alberto@x.com", "gabriel@x.com"]);
  });

  it("cada aviso tiene sus propios destinatarios", async () => {
    await notifyAdmins({ ...base, email: "emailRegistros" });
    expect(mocks.send.mock.calls[0][0].to).toEqual(["alberto@x.com"]);
  });

  it("sin aviso no envía correo", async () => {
    await notifyAdmins(base);
    await notifyAdmins({ ...base, email: false });
    expect(mocks.createMany).toHaveBeenCalledTimes(2);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("si nadie tiene el aviso activado no envía correo", async () => {
    await notifyAdmins({ ...base, email: "emailPropuestas" });
    expect(mocks.createMany).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("solo consulta admins activos", async () => {
    await notifyAdmins({ ...base, email: "emailCarpetas" });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: "admin", active: true } })
    );
  });
});
