import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  notifyAdmins: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { cronRun: { create: mocks.create, update: mocks.update } },
}));

vi.mock("@/lib/notifications", () => ({
  notifyAdmins: mocks.notifyAdmins,
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
    mocks.notifyAdmins.mockResolvedValue(undefined);
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
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });

  it("marca el fallo y alerta a los administradores", async () => {
    await expect(runCron({
      job: CRON_JOBS.dailySummary,
      source: "vercel",
      run: async () => { throw new Error("Resend unavailable"); },
    })).rejects.toThrow("Resend unavailable");

    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "run_1" },
      data: expect.objectContaining({ status: "FAILED", errorCode: "Error" }),
    }));
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "cron_failed",
      link: "/monitoring",
      email: true,
    }));
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
