/**
 * Tests para `listFinderActivity` y `summarizeFinderActivity`. Mockean Prisma
 * para verificar:
 *   - Resolución correcta de `empresa` según el tipo de action (la columna
 *     `resourceId` apunta a distintas tablas dependiendo de la acción —
 *     Empresa, Nota o Tarea).
 *   - Construcción del `where` según los filtros (finderName, action, rango).
 *   - Defaults de límite (50, cap 200).
 *   - groupBy: "finder" / "accion" usan Prisma.groupBy; "dia" y "finder_accion"
 *     usan $queryRaw (no testeado directamente — solo que enruta correcto).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logFindMany = vi.fn();
const empresaFindMany = vi.fn();
const notaFindMany = vi.fn();
const tareaFindMany = vi.fn();
const logGroupBy = vi.fn();
const finderFindMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finderAccessLog: {
      findMany: (...a: unknown[]) => logFindMany(...a),
      groupBy: (...a: unknown[]) => logGroupBy(...a),
    },
    empresa: { findMany: (...a: unknown[]) => empresaFindMany(...a) },
    nota: { findMany: (...a: unknown[]) => notaFindMany(...a) },
    tarea: { findMany: (...a: unknown[]) => tareaFindMany(...a) },
    finder: { findMany: (...a: unknown[]) => finderFindMany(...a) },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
  },
}));

import { listFinderActivity, summarizeFinderActivity } from "./finder-activity";

const T = new Date("2026-05-15T08:00:00.000Z");

beforeEach(() => {
  logFindMany.mockReset();
  empresaFindMany.mockReset();
  notaFindMany.mockReset();
  tareaFindMany.mockReset();
  logGroupBy.mockReset();
  finderFindMany.mockReset();
  queryRaw.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listFinderActivity", () => {
  it("resuelve empresa diferente según el tipo de action (Empresa / Nota / Tarea)", async () => {
    logFindMany.mockResolvedValueOnce([
      {
        id: 1,
        createdAt: T,
        finderId: "f1",
        email: null,
        action: "view_deal",
        resourceId: "100",
        ip: null,
        finder: { name: "Rafa" },
      },
      {
        id: 2,
        createdAt: T,
        finderId: "f1",
        email: null,
        action: "edit_note",
        resourceId: "200",
        ip: null,
        finder: { name: "Rafa" },
      },
      {
        id: 3,
        createdAt: T,
        finderId: "f1",
        email: null,
        action: "complete_task",
        resourceId: "300",
        ip: null,
        finder: { name: "Rafa" },
      },
      {
        id: 4,
        createdAt: T,
        finderId: "f1",
        email: null,
        action: "view_deals",
        resourceId: null,
        ip: null,
        finder: { name: "Rafa" },
      },
    ]);
    // view_deal → Empresa directa
    empresaFindMany.mockResolvedValueOnce([
      { id: 100, nombre: "ALPHA SL" },
    ]);
    // edit_note → Nota → empresa (id 201)
    notaFindMany.mockResolvedValueOnce([
      { id: 200, empresa: { id: 201, nombre: "BRAVO SL" } },
    ]);
    // complete_task → Tarea → empresa (id 301)
    tareaFindMany.mockResolvedValueOnce([
      { id: 300, empresa: { id: 301, nombre: "CHARLIE SL" } },
    ]);

    const { rows, count } = await listFinderActivity({});

    expect(count).toBe(4);
    expect(rows[0]).toMatchObject({
      action: "view_deal",
      empresa: { id: 100, nombre: "ALPHA SL" },
    });
    expect(rows[1]).toMatchObject({
      action: "edit_note",
      empresa: { id: 201, nombre: "BRAVO SL" }, // viene del JOIN Nota → Empresa
    });
    expect(rows[2]).toMatchObject({
      action: "complete_task",
      empresa: { id: 301, nombre: "CHARLIE SL" }, // viene del JOIN Tarea → Empresa
    });
    expect(rows[3]).toMatchObject({ action: "view_deals", empresa: null });
  });

  it("filtra por finderName con ILIKE parcial sobre Finder.name", async () => {
    logFindMany.mockResolvedValueOnce([]);
    await listFinderActivity({ finderName: "rafa" });
    const callArg = logFindMany.mock.calls[0][0] as {
      where: { finder?: { is: { name: { contains: string; mode: string } } } };
    };
    expect(callArg.where.finder?.is.name).toEqual({
      contains: "rafa",
      mode: "insensitive",
    });
  });

  it("filtra por action exacta", async () => {
    logFindMany.mockResolvedValueOnce([]);
    await listFinderActivity({ action: "login_failure" });
    const callArg = logFindMany.mock.calls[0][0] as { where: { action?: string } };
    expect(callArg.where.action).toBe("login_failure");
  });

  it("aplica rango createdAt cuando se pasan desde/hasta", async () => {
    logFindMany.mockResolvedValueOnce([]);
    const desde = new Date("2026-05-14T00:00:00.000Z");
    const hasta = new Date("2026-05-15T00:00:00.000Z");
    await listFinderActivity({ desde, hasta });
    const callArg = logFindMany.mock.calls[0][0] as {
      where: { createdAt?: { gte?: Date; lte?: Date } };
    };
    expect(callArg.where.createdAt).toEqual({ gte: desde, lte: hasta });
  });

  it("limit default 50, máximo 200 (clampa por encima)", async () => {
    logFindMany.mockResolvedValueOnce([]);
    await listFinderActivity({});
    expect(logFindMany.mock.calls[0][0]).toMatchObject({ take: 50 });

    logFindMany.mockResolvedValueOnce([]);
    await listFinderActivity({ limit: 9999 });
    expect(logFindMany.mock.calls[1][0]).toMatchObject({ take: 200 });

    logFindMany.mockResolvedValueOnce([]);
    await listFinderActivity({ limit: 0 });
    expect(logFindMany.mock.calls[2][0]).toMatchObject({ take: 1 });
  });

  it("no hace queries de enriquecimiento si no hay resourceIds resolubles", async () => {
    logFindMany.mockResolvedValueOnce([
      {
        id: 1,
        createdAt: T,
        finderId: null,
        email: "x@y.com",
        action: "login_failure",
        resourceId: null,
        ip: "1.1.1.1",
        finder: null,
      },
    ]);
    const { rows } = await listFinderActivity({ action: "login_failure" });
    expect(empresaFindMany).not.toHaveBeenCalled();
    expect(notaFindMany).not.toHaveBeenCalled();
    expect(tareaFindMany).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      action: "login_failure",
      email: "x@y.com",
      finder: null,
      empresa: null,
      ip: "1.1.1.1",
    });
  });

  it("ignora resourceId no numérico (defensa)", async () => {
    logFindMany.mockResolvedValueOnce([
      {
        id: 1,
        createdAt: T,
        finderId: "f1",
        email: null,
        action: "view_deal",
        resourceId: "abc-not-a-number",
        ip: null,
        finder: { name: "Rafa" },
      },
    ]);
    const { rows } = await listFinderActivity({});
    expect(empresaFindMany).not.toHaveBeenCalled();
    expect(rows[0].empresa).toBeNull();
  });
});

describe("summarizeFinderActivity", () => {
  it("agruparPor='accion' usa Prisma.groupBy con _count", async () => {
    logGroupBy.mockResolvedValueOnce([
      { action: "view_deal", _count: { _all: 14 } },
      { action: "add_task", _count: { _all: 6 } },
    ]);
    const { rows } = await summarizeFinderActivity({ groupBy: "accion" });
    expect(logGroupBy).toHaveBeenCalled();
    expect(rows).toEqual([
      { action: "view_deal", count: 14 },
      { action: "add_task", count: 6 },
    ]);
  });

  it("agruparPor='finder' enriquece con Finder.name", async () => {
    logGroupBy.mockResolvedValueOnce([
      { finderId: "f1", _count: { _all: 28 } },
      { finderId: null, _count: { _all: 3 } }, // login_failure de email desconocido
    ]);
    finderFindMany.mockResolvedValueOnce([{ id: "f1", name: "Rafael Torres" }]);
    const { rows } = await summarizeFinderActivity({ groupBy: "finder" });
    expect(rows[0]).toMatchObject({
      finderId: "f1",
      finder: "Rafael Torres",
      count: 28,
    });
    expect(rows[1]).toMatchObject({
      finderId: null,
      finder: null,
      count: 3,
    });
  });

  it("agruparPor='dia' usa $queryRaw (con DATE_TRUNC en Europe/Madrid)", async () => {
    queryRaw.mockResolvedValueOnce([
      { dia: new Date("2026-05-15T00:00:00.000Z"), count: BigInt(28) },
      { dia: new Date("2026-05-14T00:00:00.000Z"), count: BigInt(5) },
    ]);
    const { rows } = await summarizeFinderActivity({ groupBy: "dia" });
    expect(queryRaw).toHaveBeenCalled();
    expect(rows[0]).toEqual({ dia: "2026-05-15", count: 28 });
    expect(rows[1]).toEqual({ dia: "2026-05-14", count: 5 });
  });

  it("agruparPor='finder_accion' devuelve matriz finderId×action ordenada por count", async () => {
    queryRaw.mockResolvedValueOnce([
      { finderId: "f1", name: "Rafa", action: "view_deal", count: BigInt(14) },
      { finderId: "f1", name: "Rafa", action: "add_task", count: BigInt(6) },
    ]);
    const { rows } = await summarizeFinderActivity({ groupBy: "finder_accion" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      finder: "Rafa",
      action: "view_deal",
      count: 14,
    });
  });
});
