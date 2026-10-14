import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestingAdmin = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const issueLink = vi.fn();
const revokeLinks = vi.fn();
const sendInvitation = vi.fn();
const auditLog = vi.fn();

vi.mock("@/lib/admin-users", () => ({
  ADMIN_USER_SELECT: {},
  getRequestingAdmin: () => getRequestingAdmin(),
  withPendingInvitation: async <T,>(users: T[]) => users,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));

vi.mock("@/lib/admin-password-link", () => ({
  INVITATION_WINDOW_MS: 7 * 24 * 60 * 60 * 1000,
  issueAdminPasswordLink: (...args: unknown[]) => issueLink(...args),
  revokeAdminPasswordLinks: (...args: unknown[]) => revokeLinks(...args),
}));

vi.mock("@/lib/email-password-reset", () => ({
  sendAdminInvitationEmail: (...args: unknown[]) => sendInvitation(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  auditLog: (...args: unknown[]) => auditLog(...args),
}));

import { POST } from "./route";
import { PATCH } from "./[id]/route";

const ME = { id: "u-alberto", name: "Alberto", email: "alberto@fontiber.com" };

function makeReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  for (const m of [
    getRequestingAdmin,
    userFindUnique,
    userCreate,
    userUpdate,
    issueLink,
    revokeLinks,
    sendInvitation,
    auditLog,
  ]) {
    m.mockReset();
  }
  getRequestingAdmin.mockResolvedValue(ME);
  auditLog.mockResolvedValue(undefined);
  issueLink.mockResolvedValue({
    rawToken: "raw",
    expiresAt: new Date("2026-10-21T10:00:00Z"),
    url: "https://warroom.fontiber.com/reset-password?token=raw",
  });
});

describe("POST /api/admin/usuarios", () => {
  it("401 sin sesión admin", async () => {
    getRequestingAdmin.mockResolvedValue(null);
    const res = await POST(makeReq({ name: "Lucía", email: "lucia@fontiber.com" }));
    expect(res.status).toBe(401);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("409 si el email ya existe, sin crear ni enviar nada", async () => {
    userFindUnique.mockResolvedValue({ id: "u-x", active: false });
    const res = await POST(makeReq({ name: "Lucía", email: "lucia@fontiber.com" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/reactívalo/);
    expect(userCreate).not.toHaveBeenCalled();
    expect(sendInvitation).not.toHaveBeenCalled();
  });

  it("crea un admin sin contraseña, emite enlace de 7 días y envía la invitación", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({
      id: "u-lucia",
      name: "Lucía",
      email: "lucia@fontiber.com",
      active: true,
      passwordSetAt: null,
    });
    sendInvitation.mockResolvedValue(true);

    const res = await POST(makeReq({ name: " Lucía ", email: " Lucia@Fontiber.com " }));
    expect(res.status).toBe(201);
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { email: "lucia@fontiber.com", name: "Lucía", role: "admin", active: true },
      })
    );
    expect(issueLink).toHaveBeenCalledWith("u-lucia", 7 * 24 * 60 * 60 * 1000);
    expect(sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ to: "lucia@fontiber.com", invitedBy: "Alberto" })
    );
    const json = await res.json();
    expect(json.emailSent).toBe(true);
    expect(json.inviteUrl).toContain("/reset-password?token=raw");
  });

  it("si el email no sale, el alta se mantiene y devuelve el enlace para pasarlo a mano", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "u-lucia", name: "Lucía", email: "lucia@fontiber.com" });
    sendInvitation.mockResolvedValue(false);

    const res = await POST(makeReq({ name: "Lucía", email: "lucia@fontiber.com" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.emailSent).toBe(false);
    expect(json.inviteUrl).toBeTruthy();
  });
});

describe("PATCH /api/admin/usuarios/:id", () => {
  it("no deja desactivarse a uno mismo", async () => {
    userFindUnique.mockResolvedValue({ id: ME.id, role: "admin", active: true });
    const res = await PATCH(makeReq({ active: false }), params(ME.id));
    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("404 para un id que no es un usuario del war room", async () => {
    userFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeReq({ active: false }), params("u-nadie"));
    expect(res.status).toBe(404);
  });

  it("desactivar anula sus enlaces pendientes y audita", async () => {
    userFindUnique.mockResolvedValue({ id: "u-lucia", role: "admin", active: true });
    userUpdate.mockResolvedValue({ id: "u-lucia", active: false });

    const res = await PATCH(makeReq({ active: false }), params("u-lucia"));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u-lucia" }, data: { active: false } })
    );
    expect(revokeLinks).toHaveBeenCalledWith("u-lucia");
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "u-lucia", after: { active: false } })
    );
  });

  it("reactivar no toca los enlaces", async () => {
    userFindUnique.mockResolvedValue({ id: "u-lucia", role: "admin", active: false });
    userUpdate.mockResolvedValue({ id: "u-lucia", active: true });

    const res = await PATCH(makeReq({ active: true }), params("u-lucia"));
    expect(res.status).toBe(200);
    expect(revokeLinks).not.toHaveBeenCalled();
  });
});
