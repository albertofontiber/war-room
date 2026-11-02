import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
  notifyUser: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { cronRun: { create: mocks.create, update: mocks.update }, user: { findFirst: mocks.findFirst } },
}));

vi.mock("@/lib/notifications", () => ({
  notifyUser: mocks.notifyUser,
}));

vi.mock("@/lib/logger", () => ({
  log: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

import { CRON_JOBS, runCron } from "@/lib/cron-runs";

describe("runCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: "run_1" });
    mocks.update.mockResolvedValue({});
    mocks.findFirst.mockResolvedValue({ id: "alberto-id" });
    mocks.notifyUser.mockResolvedValue(undefined);
  });

  it("registra una ejecución correcta con solo el resumen agregado", async () => {
    const execution = await runCron({
      job: CRON_JOBS.borme,
      source: "vercel",
      run: async () => ({ created: 3 }),
      summary: (result) => ({ alertasCreadas: result.created }),
    });

    expect(execution.runId).toBe("run_1");
    expect(execution.status).toBe("SUCCESS");
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "run_1" },
      data: expect.objectContaining({
        status: "SUCCESS",
        summary: { alertasCreadas: 3 },
      }),
    }));
    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it("marca el fallo y alerta solo a Alberto", async () => {
    await expect(runCron({
      job: CRON_JOBS.dailySummary,
      source: "vercel",
      run: async () => { throw new Error("Resend unavailable"); },
    })).rejects.toThrow("Resend unavailable");

    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "run_1" },
      data: expect.objectContaining({ status: "FAILED", errorCode: "Error" }),
    }));
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "alberto@fontiber.com", mode: "insensitive" }, role: "admin", active: true },
      select: { id: true },
    });
    expect(mocks.notifyUser).toHaveBeenCalledOnce();
    expect(mocks.notifyUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: "alberto-id",
      tipo: "cron_failed",
      link: "/monitoring",
      email: true,
    }));
  });

  it("no avisa a otras personas si el destinatario no está disponible", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    await expect(runCron({
      job: CRON_JOBS.targetDocsCheck,
      source: "vercel",
      run: async () => { throw new Error("fallo original"); },
    })).rejects.toThrow("fallo original");
    expect(mocks.notifyUser).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("no bloquea el cron si el historial todavía no está disponible", async () => {
    mocks.create.mockRejectedValueOnce(new Error("CronRun relation missing"));

    const execution = await runCron({
      job: CRON_JOBS.taskDigest,
      source: "vercel",
      run: async () => "done",
    });

    expect(execution).toMatchObject({ value: "done", runId: null, status: "SUCCESS" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
