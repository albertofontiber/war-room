/**
 * Tests del unifier de timeline.
 *
 * Cubre:
 *   - Combinación de fuentes y orden desc por fecha.
 *   - Filtro de visibilidad de notas para finders (scope=portal).
 *   - Detección de source en tareas (manual / graph-email / graph-calendar).
 *   - Actor resuelto (admin / finder / system).
 *
 * Mocks: prisma. La integración real con BD se valida tras deploy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notaFindManyMock = vi.fn();
const tareaFindManyMock = vi.fn();
const crmLogFindManyMock = vi.fn();
const bormeFindManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    nota: { findMany: (...a: unknown[]) => notaFindManyMock(...a) },
    tarea: { findMany: (...a: unknown[]) => tareaFindManyMock(...a) },
    crmLog: { findMany: (...a: unknown[]) => crmLogFindManyMock(...a) },
    bormeAlerta: { findMany: (...a: unknown[]) => bormeFindManyMock(...a) },
  },
}));

import { getEmpresaTimeline } from "./timeline";

beforeEach(() => {
  notaFindManyMock.mockReset();
  tareaFindManyMock.mockReset();
  crmLogFindManyMock.mockReset();
  bormeFindManyMock.mockReset();
  notaFindManyMock.mockResolvedValue([]);
  tareaFindManyMock.mockResolvedValue([]);
  crmLogFindManyMock.mockResolvedValue([]);
  bormeFindManyMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getEmpresaTimeline", () => {
  it("combina eventos de 4 fuentes en una sola lista desc por fecha", async () => {
    notaFindManyMock.mockResolvedValue([
      {
        id: 1,
        contenido: "Nota A",
        createdAt: new Date("2026-05-10T10:00:00Z"),
        parentId: null,
        visibleAFinder: false,
        autor: { id: "u1", name: "Alberto" },
        autorFinder: null,
      },
    ]);
    tareaFindManyMock.mockResolvedValue([
      {
        id: 10,
        tipo: "llamada",
        titulo: "Llamada CEO",
        resultado: "Ok",
        completadaAt: new Date("2026-05-11T14:00:00Z"),
        createdAt: new Date("2026-05-11T13:00:00Z"),
        autor: { id: "u1", name: "Alberto" },
        autorFinder: null,
        asignado: null,
        asignadoFinder: null,
        emailIngest: null,
        calendarIngest: null,
      },
    ]);
    crmLogFindManyMock.mockResolvedValue([
      {
        id: 100,
        event: "stage_changed",
        fromStage: "identificado",
        toStage: "contactado",
        note: null,
        createdAt: new Date("2026-05-09T09:00:00Z"),
        autor: { id: "u1", name: "Alberto" },
        autorFinder: null,
      },
    ]);
    bormeFindManyMock.mockResolvedValue([
      {
        id: 200,
        fecha: new Date("2026-05-12T00:00:00Z"),
        tipoActo: "fusion",
        descripcion: "Fusión por absorción",
        urlBorme: "https://borme.es/fake",
        personaDetectada: null,
        grupoInferido: { nombre: "Grupo X" },
      },
    ]);

    const events = await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });

    // 4 fuentes, 4 eventos.
    expect(events).toHaveLength(4);
    // Orden desc: BORME 5-12 > tarea 5-11 > nota 5-10 > crmlog 5-09.
    expect(events.map((e) => e.kind)).toEqual([
      "borme",
      "tarea_completada",
      "nota",
      "stage_changed",
    ]);
  });

  it("notas: portal con finderId solo ve las propias o las admin visibles", async () => {
    await getEmpresaTimeline(42, { scope: "portal", finderId: "f1" });
    // Verifica que el where se construye con OR de propias + visibleAFinder.
    const callArgs = notaFindManyMock.mock.calls[0][0];
    expect(callArgs.where).toEqual({
      empresaId: 42,
      OR: [
        { autorFinderId: "f1" },
        { visibleAFinder: true },
      ],
    });
  });

  it("notas: admin ve todas sin filtro de visibilidad", async () => {
    await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });
    const callArgs = notaFindManyMock.mock.calls[0][0];
    expect(callArgs.where).toEqual({ empresaId: 42 });
  });

  it("tarea con emailIngest → source 'graph-email' y actor system", async () => {
    tareaFindManyMock.mockResolvedValue([
      {
        id: 10,
        tipo: "email",
        titulo: "Re: NDA",
        resultado: null,
        completadaAt: new Date("2026-05-11T14:00:00Z"),
        createdAt: new Date("2026-05-11T13:00:00Z"),
        autor: { id: "u1", name: "Alberto" },
        autorFinder: null,
        asignado: null,
        asignadoFinder: null,
        emailIngest: { id: 999 },
        calendarIngest: null,
      },
    ]);

    const events = await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });
    const t = events.find((e) => e.kind === "tarea_completada");
    if (t?.kind !== "tarea_completada") throw new Error("expected tarea");
    expect(t.payload.source).toBe("graph-email");
    expect(t.actor.kind).toBe("system");
  });

  it("tarea con calendarIngest → source 'graph-calendar'", async () => {
    tareaFindManyMock.mockResolvedValue([
      {
        id: 11,
        tipo: "videollamada",
        titulo: "Reunión Aize",
        resultado: null,
        completadaAt: new Date("2026-05-11T14:00:00Z"),
        createdAt: new Date("2026-05-11T13:00:00Z"),
        autor: null,
        autorFinder: null,
        asignado: null,
        asignadoFinder: null,
        emailIngest: null,
        calendarIngest: { id: 888 },
      },
    ]);

    const events = await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });
    const t = events.find((e) => e.kind === "tarea_completada");
    if (t?.kind !== "tarea_completada") throw new Error("expected tarea");
    expect(t.payload.source).toBe("graph-calendar");
    expect(t.actor.kind).toBe("system");
  });

  it("tarea manual con asignado → actor = asignado admin", async () => {
    tareaFindManyMock.mockResolvedValue([
      {
        id: 12,
        tipo: "llamada",
        titulo: "Llamar a CFO",
        resultado: "Cerrado",
        completadaAt: new Date("2026-05-11T14:00:00Z"),
        createdAt: new Date("2026-05-11T10:00:00Z"),
        autor: { id: "u1", name: "Alberto" },
        autorFinder: null,
        asignado: { id: "u2", name: "Gabriel" },
        asignadoFinder: null,
        emailIngest: null,
        calendarIngest: null,
      },
    ]);

    const events = await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });
    const t = events.find((e) => e.kind === "tarea_completada");
    if (t?.kind !== "tarea_completada") throw new Error("expected tarea");
    expect(t.payload.source).toBe("manual");
    expect(t.actor).toEqual({ kind: "admin", id: "u2", name: "Gabriel" });
  });

  it("borme actor siempre 'system' con nombre 'BORME'", async () => {
    bormeFindManyMock.mockResolvedValue([
      {
        id: 1,
        fecha: new Date("2026-05-12T00:00:00Z"),
        tipoActo: "adquisicion",
        descripcion: "Compra de filial",
        urlBorme: null,
        personaDetectada: null,
        grupoInferido: null,
      },
    ]);

    const events = await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });
    const b = events.find((e) => e.kind === "borme");
    if (b?.kind !== "borme") throw new Error("expected borme");
    expect(b.actor).toEqual({ kind: "system", id: null, name: "BORME" });
  });

  it("nota de finder: actor.kind = 'finder'", async () => {
    notaFindManyMock.mockResolvedValue([
      {
        id: 5,
        contenido: "Nota del finder",
        createdAt: new Date("2026-05-10T10:00:00Z"),
        parentId: null,
        visibleAFinder: false,
        autor: null,
        autorFinder: { id: "f1", name: "Pepe Finder" },
      },
    ]);

    const events = await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });
    const n = events.find((e) => e.kind === "nota");
    if (n?.kind !== "nota") throw new Error("expected nota");
    expect(n.actor).toEqual({ kind: "finder", id: "f1", name: "Pepe Finder" });
  });

  it("lista vacía cuando ninguna fuente devuelve eventos", async () => {
    const events = await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });
    expect(events).toEqual([]);
  });

  it("desempate por id cuando dos eventos tienen la misma fecha", async () => {
    const sameDate = new Date("2026-05-10T10:00:00Z");
    notaFindManyMock.mockResolvedValue([
      {
        id: 1,
        contenido: "A",
        createdAt: sameDate,
        parentId: null,
        visibleAFinder: false,
        autor: { id: "u1", name: "X" },
        autorFinder: null,
      },
      {
        id: 2,
        contenido: "B",
        createdAt: sameDate,
        parentId: null,
        visibleAFinder: false,
        autor: { id: "u1", name: "X" },
        autorFinder: null,
      },
    ]);

    const events = await getEmpresaTimeline(42, { scope: "admin", userId: "u1" });
    // Mismo timestamp → ordena por id (alfabético): "nota-1" < "nota-2".
    expect(events.map((e) => e.id)).toEqual(["nota-1", "nota-2"]);
  });
});
